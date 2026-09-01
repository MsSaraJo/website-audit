import { db } from './db';
import type { AuditStatus, AuditTier } from './types';

export async function createAudit(input: { source: 'manual' | 'etsy'; email: string; url: string; tier: AuditTier; competitorUrls?: string[]; etsyReceiptId?: string; inputData?: unknown }) {
  const { data, error } = await db.from('audits').insert({
    source: input.source, customer_email: input.email, target_url: input.url, tier: input.tier,
    competitor_urls: input.competitorUrls ?? [], etsy_receipt_id: input.etsyReceiptId ?? null, input_data: input.inputData ?? {}, status: 'pending',
  }).select('*').single();
  if (error) {
    if (input.etsyReceiptId) {
      const existing = await db.from('audits').select('*').eq('etsy_receipt_id', input.etsyReceiptId).maybeSingle();
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
