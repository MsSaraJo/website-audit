import { after, NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { db } from '@/lib/db';
import { verifyEtsyWebhook } from '@/lib/etsy-webhook';
import { getEtsyOrderContext } from '@/lib/etsy';
import { createAudit } from '@/lib/repository';
import { processAudit } from '@/lib/pipeline';

export const runtime = 'nodejs';
export const maxDuration = 800;

export async function POST(req: Request) {
  if (!env.ETSY_WEBHOOK_SECRET) return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 });
  const rawBody = await req.text();
  const webhookId = req.headers.get('webhook-id');
  const ok = verifyEtsyWebhook({ rawBody, webhookId, webhookTimestamp: req.headers.get('webhook-timestamp'), webhookSignature: req.headers.get('webhook-signature'), secret: env.ETSY_WEBHOOK_SECRET });
  if (!ok) return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  let payload: any;
  try { payload = JSON.parse(rawBody); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (payload.event_type !== 'order.paid') return NextResponse.json({ ok: true, ignored: true });
  if (!webhookId) return NextResponse.json({ error: 'Missing webhook id' }, { status: 400 });

  const { data: existing, error: existingError } = await db.from('webhook_events').select('processed,audit_id,error_message').eq('webhook_id', webhookId).maybeSingle();
  if (existingError) throw existingError;
  if (existing?.processed) return NextResponse.json({ ok: true, duplicate: true, auditId: existing.audit_id });
  if (!existing) {
    const { error } = await db.from('webhook_events').insert({ webhook_id: webhookId, event_type: payload.event_type, payload });
    if (error) throw error;
  }

  try {
    const order = await getEtsyOrderContext(payload.resource_url, Number(payload.shop_id));
    if (!order.buyerEmail) throw new Error('ORDER_INPUT: Etsy did not provide buyer_email. Request buyer_email access or configure another delivery channel.');
    const audit = await createAudit({ source: 'etsy', email: order.buyerEmail, url: order.url, tier: order.tier, competitorUrls: order.competitorUrls, etsyReceiptId: order.receiptId, inputData: order.raw });
    await db.from('webhook_events').update({ processed: true, audit_id: audit.id, error_message: null }).eq('webhook_id', webhookId);
    after(() => processAudit(audit.id).catch(console.error));
    return NextResponse.json({ ok: true, auditId: audit.id }, { status: 202 });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await db.from('webhook_events').update({ error_message: message.slice(0, 2000) }).eq('webhook_id', webhookId);
    if (message.startsWith('ORDER_INPUT:') || message.includes('No website URL found')) {
      return NextResponse.json({ ok: true, needsAttention: true, reason: message.replace(/^ORDER_INPUT:\s*/, '') });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
