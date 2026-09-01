import { Resend } from 'resend';
import { db } from './db';
import { env } from './env';
import { productForTier } from './products';
import type { AuditTier } from './types';

export async function uploadReport(auditId: string, pdf: Buffer) {
  const path = `${auditId}/website-audit.pdf`;
  const { error } = await db.storage.from(env.SUPABASE_REPORT_BUCKET).upload(path, pdf, { contentType: 'application/pdf', upsert: true });
  if (error) throw error;
  const { data, error: signedError } = await db.storage.from(env.SUPABASE_REPORT_BUCKET).createSignedUrl(path, 60 * 60 * 24 * 7);
  if (signedError) throw signedError;
  return { path, url: data.signedUrl };
}

export async function emailReport(to: string, reportUrl: string, score: number, tier: AuditTier) {
  if (!env.RESEND_API_KEY) throw new Error('RESEND_API_KEY is not configured');
  const resend = new Resend(env.RESEND_API_KEY);
  const product = productForTier(tier);
  const { error } = await resend.emails.send({
    from: env.REPORT_FROM_EMAIL,
    to: [to],
    subject: `Your ${product.shortName} website audit is ready — score ${score}/100`,
    html: `<p>Your personalized ${product.name} is complete.</p><p><a href="${reportUrl}">Open your PDF audit report</a></p><p>This private link expires in 7 days. If you purchased through Etsy, your order will also be completed in Etsy once the report file is attached to your order.</p>`,
  });
  if (error) throw new Error(`Resend failed: ${error.message}`);
}
