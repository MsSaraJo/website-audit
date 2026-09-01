import { Resend } from 'resend';
import { db } from './db';
import { env } from './env';

export async function uploadReport(auditId: string, pdf: Buffer) {
  const path = `${auditId}/website-audit.pdf`;
  const { error } = await db.storage.from(env.SUPABASE_REPORT_BUCKET).upload(path, pdf, { contentType: 'application/pdf', upsert: true });
  if (error) throw error;
  const { data, error: signedError } = await db.storage.from(env.SUPABASE_REPORT_BUCKET).createSignedUrl(path, 60 * 60 * 24 * 7);
  if (signedError) throw signedError;
  return { path, url: data.signedUrl };
}

export async function emailReport(to: string, reportUrl: string, score: number) {
  const resend = new Resend(env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: env.REPORT_FROM_EMAIL,
    to: [to],
    subject: `Your website audit is ready — score ${score}/100`,
    html: `<p>Your website audit is complete.</p><p><a href="${reportUrl}">Open your PDF audit report</a></p><p>This private link expires in 7 days.</p>`,
  });
  if (error) throw new Error(`Resend failed: ${error.message}`);
}
