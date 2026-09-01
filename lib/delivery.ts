import nodemailer from 'nodemailer';
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

export async function notifyAdmin(input: {
  auditId: string;
  reportUrl: string;
  score: number;
  tier: AuditTier;
  source: 'manual' | 'etsy';
  targetUrl: string;
  etsyReceiptId?: string | null;
  etsyListingTitle?: string | null;
  etsySku?: string | null;
}) {
  if (!env.ADMIN_NOTIFICATION_EMAIL || !env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASSWORD) {
    console.log(`[audit ${input.auditId}] admin email notification skipped; SMTP is not fully configured`);
    return false;
  }

  const product = productForTier(input.tier);
  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    requireTLS: !env.SMTP_SECURE,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASSWORD,
    },
    tls: { minVersion: 'TLSv1.2' },
  });

  const isEtsy = input.source === 'etsy';
  const subject = isEtsy
    ? `MsSaraJo audit ready for Etsy upload — ${input.score}/100`
    : `MsSaraJo manual audit complete — ${input.score}/100`;

  const details = [
    `<p><strong>Product:</strong> ${escapeHtml(product.name)}</p>`,
    `<p><strong>Website:</strong> ${escapeHtml(input.targetUrl)}</p>`,
    `<p><strong>Score:</strong> ${input.score}/100</p>`,
    input.etsyReceiptId ? `<p><strong>Etsy receipt:</strong> ${escapeHtml(input.etsyReceiptId)}</p>` : '',
    input.etsyListingTitle ? `<p><strong>Listing:</strong> ${escapeHtml(input.etsyListingTitle)}</p>` : '',
    input.etsySku ? `<p><strong>SKU:</strong> ${escapeHtml(input.etsySku)}</p>` : '',
  ].filter(Boolean).join('');

  await transporter.sendMail({
    from: `MsSaraJo Website Audits <${env.SMTP_USER}>`,
    to: env.ADMIN_NOTIFICATION_EMAIL,
    subject,
    html: `
      <h2>${isEtsy ? 'Audit ready for Etsy upload' : 'Manual audit complete'}</h2>
      ${details}
      <p><a href="${input.reportUrl}">Open the generated PDF report</a></p>
      <p>This private report link expires in 7 days.</p>
      ${isEtsy ? '<p>Next step: open the matching Etsy order, upload the PDF as the made-to-order digital file, complete the order, then mark it uploaded in the MsSaraJo admin queue.</p>' : ''}
    `,
  });

  return true;
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
