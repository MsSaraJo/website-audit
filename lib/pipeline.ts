import { claimAudit, getAudit, touchAudit, updateAudit } from './repository';
import { scrapeSite } from './scraper';
import { runPageSpeed } from './pagespeed';
import { analyzeAudit } from './llm';
import { renderReportHtml } from './report-template';
import { htmlToPdf } from './pdf';
import { notifyAdmin, uploadReport } from './delivery';
import { assertPublicUrl } from './url-security';
import { withTimeout } from './timeouts';
import type { AuditTier } from './types';

const scrapeTimeouts: Record<AuditTier, number> = {
  quick_win: 90_000,
  full_site: 210_000,
  competitor_conquest: 300_000,
};

const pageSpeedTimeouts: Record<AuditTier, number> = {
  quick_win: 110_000,
  full_site: 130_000,
  competitor_conquest: 150_000,
};

export async function processAudit(id: string) {
  if (!(await claimAudit(id))) return;
  const audit = await getAudit(id);
  const startedAt = Date.now();

  try {
    const target = await assertPublicUrl(audit.target_url);
    const tier = audit.tier as AuditTier;

    console.info(`[audit ${id}] scraping started for ${target}`);
    const site = await withTimeout(
      'Website scraping',
      scrapeTimeouts[tier],
      scrapeSite(target, tier),
    );
    console.info(`[audit ${id}] ${tier} scraped ${site.pages.length} page(s): ${site.pages.map(p => p.url).join(', ')}`);
    if (tier === 'full_site' && site.pages.length < 2) {
      console.warn(`[audit ${id}] Comprehensive audit found only ${site.pages.length} crawlable page. Internal-link and sitemap discovery were both attempted.`);
    }

    // Scraping is genuinely finished at this point. Persist it immediately so the
    // Studio does not appear frozen while PageSpeed and competitor evidence run.
    await updateAudit(id, 'analyzing', {
      scrape_data: site,
      input_data: {
        ...(audit.input_data ?? {}),
        pipelineStage: 'measuring',
        pipelineStageStartedAt: new Date().toISOString(),
      },
    });

    console.info(`[audit ${id}] PageSpeed measurement started`);
    const pageSpeed = await withTimeout(
      'PageSpeed measurement',
      pageSpeedTimeouts[tier],
      runPageSpeed(site.pages.map(p => p.url), tier),
    ).catch(error => {
      console.warn(`[audit ${id}] PageSpeed measurement did not complete; continuing with available site evidence`, error);
      return [];
    });

    const competitorUrls = (audit.competitor_urls ?? []) as string[];
    const competitors = [] as Array<{url:string; site:any; pageSpeed:any}>;
    if (tier === 'competitor_conquest') {
      for (const [index, url] of competitorUrls.slice(0, 3).entries()) {
        await touchAudit(id, {
          input_data: {
            ...(audit.input_data ?? {}),
            pipelineStage: `competitor_${index + 1}`,
            pipelineStageStartedAt: new Date().toISOString(),
          },
        });
        try {
          const safe = await assertPublicUrl(url);
          const csite = await withTimeout(
            `Competitor ${index + 1} scraping`,
            75_000,
            scrapeSite(safe, 'quick_win'),
          );
          const cps = await withTimeout(
            `Competitor ${index + 1} PageSpeed`,
            105_000,
            runPageSpeed(csite.pages.map(p => p.url), 'quick_win'),
          ).catch(() => []);
          competitors.push({ url: safe, site: csite, pageSpeed: cps });
        } catch (error) {
          console.warn(`[audit ${id}] competitor ${index + 1} skipped`, error);
        }
      }
    }

    await touchAudit(id, {
      pagespeed_data: pageSpeed,
      competitor_data: competitors,
      input_data: {
        ...(audit.input_data ?? {}),
        pipelineStage: 'llm_analysis',
        pipelineStageStartedAt: new Date().toISOString(),
      },
    });

    const customerContext = audit.input_data?.buyerInputs ?? undefined;
    const analysis = await withTimeout(
      'AI analysis',
      180_000,
      analyzeAudit({ tier, site, pageSpeed, competitors, customerContext }),
    );

    await updateAudit(id, 'generating_pdf', {
      analysis,
      input_data: {
        ...(audit.input_data ?? {}),
        pipelineStage: 'pdf',
        pipelineStageStartedAt: new Date().toISOString(),
      },
    });

    const html = renderReportHtml({ analysis, site, pageSpeed, tier, createdAt: audit.created_at, competitors });
    const pdf = await withTimeout('PDF generation', 120_000, htmlToPdf(html));
    const etsyMaxFileBytes = 20 * 1024 * 1024;
    if (audit.source === 'etsy' && pdf.byteLength > etsyMaxFileBytes) {
      throw new Error(`Generated PDF is ${(pdf.byteLength / 1024 / 1024).toFixed(1)} MB, above Etsy's 20 MB per-file limit for digital order uploads.`);
    }
    const uploaded = await withTimeout('Report upload', 60_000, uploadReport(id, pdf));

    try {
      await notifyAdmin({
        auditId: id,
        reportUrl: uploaded.url,
        score: analysis.overallScore,
        tier,
        source: audit.source,
        targetUrl: audit.target_url,
        etsyReceiptId: audit.etsy_receipt_id,
        etsyListingTitle: audit.etsy_listing_title,
        etsySku: audit.etsy_sku,
      });
    } catch (notificationError) {
      console.error(`[audit ${id}] admin email notification failed; report remains available`, notificationError);
    }

    const completePatch = {
      report_path: uploaded.path,
      report_url: uploaded.url,
      input_data: {
        ...(audit.input_data ?? {}),
        pipelineStage: 'complete',
        pipelineStageStartedAt: new Date().toISOString(),
      },
    };

    if (audit.source === 'etsy') {
      await updateAudit(id, 'awaiting_etsy_upload', completePatch);
    } else {
      await updateAudit(id, 'completed', {
        ...completePatch,
        completed_at: new Date().toISOString(),
      });
    }
    console.info(`[audit ${id}] completed pipeline in ${Math.round((Date.now() - startedAt) / 1000)}s`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[audit ${id}] pipeline failed after ${Math.round((Date.now() - startedAt) / 1000)}s: ${message}`, err);
    await updateAudit(id, 'failed', {
      error_message: message.slice(0, 2000),
      input_data: {
        ...(audit.input_data ?? {}),
        pipelineStage: 'failed',
        pipelineStageStartedAt: new Date().toISOString(),
      },
    });
    throw err;
  }
}
