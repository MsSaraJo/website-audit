import { db } from './db';
import type { AuditStatus, AuditTier } from './types';

export async function createAudit(input: {
  source: 'manual' | 'etsy';
  email?: string | null;
  url: string;
  tier: AuditTier;
  competitorUrls?: string[];
  etsyReceiptId?: string;
  etsyTransactionId?: string;
  etsyListingId?: string;
  etsyListingTitle?: string;
  etsySku?: string;
  etsyQuantity?: number;
  inputData?: unknown;
}) {
  const row = {
    source: input.source,
    customer_email: input.email ?? null,
    target_url: input.url,
    tier: input.tier,
    competitor_urls: input.competitorUrls ?? [],
    etsy_receipt_id: input.etsyReceiptId ?? null,
    etsy_transaction_id: input.etsyTransactionId ?? null,
    etsy_listing_id: input.etsyListingId ?? null,
    etsy_listing_title: input.etsyListingTitle ?? null,
    etsy_sku: input.etsySku ?? null,
    etsy_quantity: input.etsyQuantity ?? 1,
    input_data: input.inputData ?? {},
    status: 'pending',
  };
  const { data, error } = await db.from('audits').insert(row).select('*').single();
  if (error) {
    if (input.etsyTransactionId) {
      const existing = await db.from('audits').select('*').eq('etsy_transaction_id', input.etsyTransactionId).maybeSingle();
      if (existing.data) return existing.data;
    }
    throw error;
  }
  return data;
}

export async function getAudit(id: string) {
  const { data, error } = await db.from('audits').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

export async function claimAudit(id: string): Promise<boolean> {
  const { data, error } = await db.rpc('claim_audit', { p_id: id });
  if (error) throw error;
  return Boolean(data);
}

export async function updateAudit(id: string, status: AuditStatus, patch: Record<string, unknown> = {}) {
  const { error } = await db.from('audits').update({ status, ...patch, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}
