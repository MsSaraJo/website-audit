import { claimAudit, getAudit, updateAudit } from './repository';
import { scrapeSite } from './scraper';
import { runPageSpeed } from './pagespeed';
import { analyzeAudit } from './llm';
import { renderReportHtml } from './report-template';
import { htmlToPdf } from './pdf';
import { emailReport, uploadReport } from './delivery';
import { env } from './env';
import { assertPublicUrl } from './url-security';
import type { AuditTier } from './types';

export async function processAudit(id: string) {
  if (!(await claimAudit(id))) return;
  const audit = await getAudit(id);
  try {
    const target = await assertPublicUrl(audit.target_url);
    const tier = audit.tier as AuditTier;
    const site = await scrapeSite(target, tier);
    const pageSpeed = await runPageSpeed(site.pages.map(p => p.url), tier);
    const competitorUrls = (audit.competitor_urls ?? []) as string[];
    const competitors = [] as Array<{url:string; site:any; pageSpeed:any}>;
    if (tier === 'competitor_conquest') {
      for (const url of competitorUrls.slice(0, 3)) {
        try {
          const safe = await assertPublicUrl(url);
          const csite = await scrapeSite(safe, 'quick_win');
          const cps = await runPageSpeed(csite.pages.map(p => p.url), 'quick_win');
          competitors.push({ url: safe, site: csite, pageSpeed: cps });
        } catch { /* keep customer report moving if one competitor fails */ }
      }
    }
    await updateAudit(id, 'analyzing', { scrape_data: site, pagespeed_data: pageSpeed, competitor_data: competitors });
    const customerContext = audit.input_data?.buyerInputs ?? undefined;
    const analysis = await analyzeAudit({ tier, site, pageSpeed, competitors, customerContext });
    await updateAudit(id, 'generating_pdf', { analysis });
    const html = renderReportHtml({ analysis, site, pageSpeed, tier, createdAt: audit.created_at });
    const pdf = await htmlToPdf(html);
    const etsyMaxFileBytes = 20 * 1024 * 1024;
    if (audit.source === 'etsy' && pdf.byteLength > etsyMaxFileBytes) {
      throw new Error(`Generated PDF is ${(pdf.byteLength / 1024 / 1024).toFixed(1)} MB, above Etsy's 20 MB per-file limit for digital order uploads.`);
    }
    const uploaded = await uploadReport(id, pdf);

    let emailDeliveredAt: string | null = null;
    const shouldEmail = audit.source === 'manual' || (audit.source === 'etsy' && env.ETSY_EMAIL_COPY_ENABLED === 'true');
    if (shouldEmail && audit.customer_email) {
      await emailReport(audit.customer_email, uploaded.url, analysis.overallScore, tier);
      emailDeliveredAt = new Date().toISOString();
    }

    if (audit.source === 'etsy') {
      await updateAudit(id, 'awaiting_etsy_upload', {
        report_path: uploaded.path,
        report_url: uploaded.url,
        email_delivered_at: emailDeliveredAt,
      });
    } else {
      await updateAudit(id, 'completed', {
        report_path: uploaded.path,
        report_url: uploaded.url,
        email_delivered_at: emailDeliveredAt,
        completed_at: new Date().toISOString(),
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await updateAudit(id, 'failed', { error_message: message.slice(0, 2000) });
    throw err;
  }
}
