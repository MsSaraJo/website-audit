import { after, NextResponse } from 'next/server';
import { z } from 'zod';
import { env } from '@/lib/env';
import { db } from '@/lib/db';
import { assertPublicUrl } from '@/lib/url-security';
import { createAudit } from '@/lib/repository';
import { processAudit } from '@/lib/pipeline';
import { productForTier } from '@/lib/products';

export const runtime = 'nodejs';
export const maxDuration = 800;

const inputSchema = z.object({
  email: z.string().email(),
  url: z.string().min(4),
  tier: z.enum(['quick_win', 'full_site', 'competitor_conquest']),
  competitorUrls: z.array(z.string()).max(3).default([]),
});

function authorized(req: Request) {
  return req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') === env.ADMIN_TOKEN;
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const url = new URL(req.url);
  const status = url.searchParams.get('status');
  let query = db.from('audits').select('id,source,status,tier,target_url,created_at,updated_at,etsy_receipt_id,etsy_transaction_id,etsy_listing_id,etsy_listing_title,etsy_sku,etsy_quantity,report_path,error_message,analysis').order('created_at', { ascending: false }).limit(100);
  if (status) query = query.eq('status', status);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    audits: (data ?? []).map((audit: any) => ({
      id: audit.id,
      source: audit.source,
      status: audit.status,
      tier: audit.tier,
      product: productForTier(audit.tier).name,
      targetUrl: audit.target_url,
      createdAt: audit.created_at,
      updatedAt: audit.updated_at,
      etsyReceiptId: audit.etsy_receipt_id,
      etsyTransactionId: audit.etsy_transaction_id,
      etsyListingId: audit.etsy_listing_id,
      etsyListingTitle: audit.etsy_listing_title,
      etsySku: audit.etsy_sku,
      etsyQuantity: audit.etsy_quantity,
      score: audit.analysis?.overallScore ?? null,
      error: audit.error_message,
      hasReport: Boolean(audit.report_path),
    })),
  });
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const input = inputSchema.parse(await req.json());
    const url = await assertPublicUrl(input.url);
    const competitorUrls = [];
    for (const c of input.competitorUrls) competitorUrls.push(await assertPublicUrl(c));
    const audit = await createAudit({ source: 'manual', email: input.email, url, tier: input.tier, competitorUrls });
    after(() => processAudit(audit.id).catch(console.error));
    return NextResponse.json({ id: audit.id, status: audit.status }, { status: 202 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Invalid request' }, { status: 400 });
  }
}
