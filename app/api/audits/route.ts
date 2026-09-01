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
  email: z.string().email().optional(),
  url: z.string().min(4),
  tier: z.enum(['quick_win', 'full_site', 'competitor_conquest']),
  competitorUrls: z.array(z.string()).max(3).default([]),
});

function authorized(req: Request) {
  return req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') === env.ADMIN_TOKEN;
}

function errorText(error: unknown): string {
  if (error instanceof z.ZodError) {
    return error.issues.map(issue => `${issue.path.join('.') || 'request'}: ${issue.message}`).join('; ');
  }
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object') {
    const value = error as Record<string, unknown>;
    const parts = [value.message, value.details, value.hint]
      .filter((part): part is string => typeof part === 'string' && part.trim().length > 0);
    if (parts.length) return parts.join(' — ');
  }
  return String(error || 'Unknown error');
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

  let body: unknown;
  try {
    body = await req.json();
  } catch (error) {
    return NextResponse.json({ error: `Request JSON could not be read: ${errorText(error)}` }, { status: 400 });
  }

  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: `Request validation failed: ${errorText(parsed.error)}` }, { status: 400 });
  }

  const input = parsed.data;
  let url: string;
  const competitorUrls: string[] = [];

  try {
    url = await assertPublicUrl(input.url);
  } catch (error) {
    return NextResponse.json({ error: `Website URL validation failed: ${errorText(error)}` }, { status: 400 });
  }

  try {
    for (const competitor of input.competitorUrls) competitorUrls.push(await assertPublicUrl(competitor));
  } catch (error) {
    return NextResponse.json({ error: `Competitor URL validation failed: ${errorText(error)}` }, { status: 400 });
  }

  try {
    const audit = await createAudit({ source: 'manual', email: input.email ?? null, url, tier: input.tier, competitorUrls });
    after(() => processAudit(audit.id).catch(error => console.error(`[audit ${audit.id}] pipeline failed`, error)));
    return NextResponse.json({ id: audit.id, status: audit.status }, { status: 202 });
  } catch (error) {
    const message = errorText(error);
    console.error('[manual audit] database insert failed', error);
    const migrationHint = /etsy_transaction_id|etsy_listing_id|etsy_listing_title|etsy_sku|etsy_quantity|email_delivered_at|schema cache/i.test(message)
      ? ' Your Supabase database appears to be missing the Etsy made-to-order schema upgrade. Run supabase/migrations/002_etsy_made_to_order.sql in the Supabase SQL Editor, then retry.'
      : '';
    return NextResponse.json({ error: `Could not create the audit: ${message}.${migrationHint}` }, { status: 500 });
  }
}
