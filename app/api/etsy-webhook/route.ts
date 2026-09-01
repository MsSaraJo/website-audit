import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { db } from '@/lib/db';
import { verifyEtsyWebhook } from '@/lib/etsy-webhook';
import { getEtsyOrderContext, isEtsyShopOwnershipError } from '@/lib/etsy';
import { createAudit } from '@/lib/repository';
import { dispatchAudit } from '@/lib/audit-dispatch';
import { z } from 'zod';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  if (!env.ETSY_WEBHOOK_SECRET) return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 });
  const rawBody = await req.text();
  const webhookId = req.headers.get('webhook-id');
  const ok = verifyEtsyWebhook({ rawBody, webhookId, webhookTimestamp: req.headers.get('webhook-timestamp'), webhookSignature: req.headers.get('webhook-signature'), secret: env.ETSY_WEBHOOK_SECRET });
  if (!ok) return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  const webhookPayloadSchema = z.object({
    event_type: z.string().min(1),
    resource_url: z.string().url(),
    shop_id: z.coerce.number().int().positive(),
  }).passthrough();

  let payload: z.infer<typeof webhookPayloadSchema>;
  try {
    payload = webhookPayloadSchema.parse(JSON.parse(rawBody));
  } catch (error) {
    const detail = error instanceof z.ZodError
      ? error.issues.map(issue => `${issue.path.join('.') || 'payload'}: ${issue.message}`).join('; ')
      : 'Invalid JSON';
    return NextResponse.json({ error: 'Invalid Etsy webhook payload', detail }, { status: 400 });
  }
  if (payload.event_type !== 'order.paid') return NextResponse.json({ ok: true, ignored: true, eventType: payload.event_type });
  if (!webhookId) return NextResponse.json({ error: 'Missing webhook id' }, { status: 400 });

  const { data: existing, error: existingError } = await db.from('webhook_events').select('processed,audit_id,audit_ids,error_message').eq('webhook_id', webhookId).maybeSingle();
  if (existingError) throw existingError;
  if (existing?.processed) return NextResponse.json({ ok: true, duplicate: true, auditIds: existing.audit_ids ?? (existing.audit_id ? [existing.audit_id] : []) });
  if (!existing) {
    const { error } = await db.from('webhook_events').insert({ webhook_id: webhookId, event_type: payload.event_type, payload });
    if (error) throw error;
  }

  try {
    const order = await getEtsyOrderContext(payload.resource_url, Number(payload.shop_id));
    if (!order.items.length) {
      await db.from('webhook_events').update({ processed: true, error_message: 'No configured MsSaraJo audit listing was present in this receipt.' }).eq('webhook_id', webhookId);
      return NextResponse.json({ ok: true, ignored: true, reason: 'No configured audit listing in receipt' });
    }

    const auditIds: string[] = [];
    const issues: Array<{ transactionId: string; listingId: string; reason: string }> = [];

    for (const item of order.items) {
      if (!item.url || item.issue) {
        issues.push({ transactionId: item.transactionId, listingId: item.listingId, reason: item.issue ?? 'Missing website URL' });
        continue;
      }
      const audit = await createAudit({
        source: 'etsy',
        email: order.buyerEmail ?? null,
        url: item.url,
        tier: item.tier,
        competitorUrls: item.competitorUrls,
        etsyReceiptId: order.receiptId,
        etsyTransactionId: item.transactionId,
        etsyListingId: item.listingId,
        etsyListingTitle: item.listingTitle,
        etsySku: item.sku,
        etsyQuantity: item.quantity,
        inputData: {
          buyerName: order.buyerName,
          buyerInputs: item.buyerInputs,
          transaction: item.rawTransaction,
          receipt: order.raw.receipt,
        },
      });
      auditIds.push(audit.id);
      await dispatchAudit(audit.id, req.url);
    }

    await db.from('webhook_events').update({
      processed: true,
      audit_id: auditIds[0] ?? null,
      audit_ids: auditIds,
      error_message: issues.length ? JSON.stringify(issues).slice(0, 2000) : null,
    }).eq('webhook_id', webhookId);

    return NextResponse.json({
      ok: true,
      auditIds,
      needsAttention: issues.length > 0,
      issues,
    }, { status: auditIds.length ? 202 : 200 });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);

    // Etsy's Webhook Portal sends a synthetic order.paid event using a shop/receipt
    // that the connected seller does not own. Signature verification has already
    // proved that the delivery came from Etsy, so acknowledge this class of test
    // cleanly rather than returning 500 and causing webhook retries. The same
    // response is also safer for a genuine signed event from a shop that is not
    // authorized by this Studio connection: ignore it instead of processing it.
    if (isEtsyShopOwnershipError(e)) {
      const isPortalStyleTest = Number(payload.shop_id) === 12345;
      const reason = isPortalStyleTest
        ? 'Etsy Webhook Portal test received and signature verified; synthetic shop is not owned by the connected account.'
        : `Signed Etsy event ignored because the connected Etsy account is not authorized for shop ${payload.shop_id}.`;
      await db.from('webhook_events').update({
        processed: true,
        error_message: reason.slice(0, 2000),
      }).eq('webhook_id', webhookId);
      return NextResponse.json({
        ok: true,
        test: isPortalStyleTest,
        ignored: !isPortalStyleTest,
        signatureVerified: true,
        reason,
      });
    }

    await db.from('webhook_events').update({ error_message: message.slice(0, 2000) }).eq('webhook_id', webhookId);
    return NextResponse.json({
      error: 'Etsy order processing failed',
      detail: message,
      webhookId,
      shopId: payload.shop_id,
    }, { status: 500 });
  }
}
