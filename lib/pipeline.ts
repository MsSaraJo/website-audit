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

function elapsedMs(startedAt: number) {
  return Date.now() - startedAt;
}

function formatMs(ms: number) {
  return `${ms}ms (${(ms / 1000).toFixed(1)}s)`;
}

export async function processAudit(id: string) {
  const pipelineStartedAt = Date.now();
  let currentStage = 'claiming';
  let tier: AuditTier | undefined;

  console.info(`[audit ${id}] [pipeline] invocation started`);

  const claimStartedAt = Date.now();
  if (!(await claimAudit(id))) {
    console.info(`[audit ${id}] [pipeline] claim skipped after ${formatMs(elapsedMs(claimStartedAt))}; audit was already claimed or is not pending`);
    return;
  }
  console.info(`[audit ${id}] [pipeline] claim acquired in ${formatMs(elapsedMs(claimStartedAt))}`);

  const loadStartedAt = Date.now();
  const audit = await getAudit(id);
  tier = audit.tier as AuditTier;
  console.info(`[audit ${id}] [${tier}] [pipeline] audit loaded in ${formatMs(elapsedMs(loadStartedAt))}`);

  try {
    currentStage = 'url_validation';
    const validationStartedAt = Date.now();
    const target = await assertPublicUrl(audit.target_url);
    console.info(`[audit ${id}] [${tier}] [url_validation] complete in ${formatMs(elapsedMs(validationStartedAt))}: ${target}`);

    currentStage = 'scraping';
    const scrapeStartedAt = Date.now();
    console.info(`[audit ${id}] [${tier}] [scraping] started`);
    const site = await withTimeout(
      'Website scraping',
      scrapeTimeouts[tier],
      scrapeSite(target, tier, id),
    );
    console.info(`[audit ${id}] [${tier}] [scraping] complete in ${formatMs(elapsedMs(scrapeStartedAt))}; ${site.pages.length} page(s): ${site.pages.map(p => p.url).join(', ')}`);
    if (tier === 'full_site' && site.pages.length < 2) {
      console.warn(`[audit ${id}] [${tier}] [scraping] Comprehensive audit found only ${site.pages.length} crawlable page. Internal-link and sitemap discovery were both attempted.`);
    }

    // Scraping is genuinely finished at this point. Persist it immediately so the
    // Studio does not appear frozen while PageSpeed and competitor evidence run.
    currentStage = 'persist_measuring_stage';
    const measuringPersistStartedAt = Date.now();
    await updateAudit(id, 'analyzing', {
      scrape_data: site,
      input_data: {
        ...(audit.input_data ?? {}),
        pipelineStage: 'measuring',
        pipelineStageStartedAt: new Date().toISOString(),
      },
    });
    console.info(`[audit ${id}] [${tier}] [database] measuring stage persisted in ${formatMs(elapsedMs(measuringPersistStartedAt))}`);

    currentStage = 'pagespeed';
    const pageSpeedStartedAt = Date.now();
    console.info(`[audit ${id}] [${tier}] [pagespeed] batch started for ${site.pages.length} scraped page(s)`);
    const pageSpeed = await withTimeout(
      'PageSpeed measurement',
      pageSpeedTimeouts[tier],
      runPageSpeed(site.pages.map(p => p.url), tier, id, 'target'),
    ).catch(error => {
      console.warn(`[audit ${id}] [${tier}] [pagespeed] batch did not complete after ${formatMs(elapsedMs(pageSpeedStartedAt))}; continuing with available site evidence`, error);
      return [];
    });
    console.info(`[audit ${id}] [${tier}] [pagespeed] batch finished in ${formatMs(elapsedMs(pageSpeedStartedAt))}; ${pageSpeed.length} result(s) available`);

    const competitorUrls = (audit.competitor_urls ?? []) as string[];
    const competitors = [] as Array<{url:string; site:any; pageSpeed:any}>;
    if (tier === 'competitor_conquest') {
      currentStage = 'competitor_evidence';
      const competitorsStartedAt = Date.now();
      console.info(`[audit ${id}] [${tier}] [competitors] started for ${Math.min(competitorUrls.length, 3)} competitor(s)`);

      for (const [index, url] of competitorUrls.slice(0, 3).entries()) {
        const competitorNumber = index + 1;
        const competitorStartedAt = Date.now();
        console.info(`[audit ${id}] [${tier}] [competitor ${competitorNumber}] started: ${url}`);

        const competitorStagePersistStartedAt = Date.now();
        await touchAudit(id, {
          input_data: {
            ...(audit.input_data ?? {}),
            pipelineStage: `competitor_${competitorNumber}`,
            pipelineStageStartedAt: new Date().toISOString(),
          },
        });
        console.info(`[audit ${id}] [${tier}] [competitor ${competitorNumber}] stage persisted in ${formatMs(elapsedMs(competitorStagePersistStartedAt))}`);

        try {
          const competitorValidationStartedAt = Date.now();
          const safe = await assertPublicUrl(url);
          console.info(`[audit ${id}] [${tier}] [competitor ${competitorNumber}] URL validated in ${formatMs(elapsedMs(competitorValidationStartedAt))}`);

          const competitorScrapeStartedAt = Date.now();
          const csite = await withTimeout(
            `Competitor ${competitorNumber} scraping`,
            75_000,
            scrapeSite(safe, 'quick_win', id, `competitor_${competitorNumber}`),
          );
          console.info(`[audit ${id}] [${tier}] [competitor ${competitorNumber}] scrape complete in ${formatMs(elapsedMs(competitorScrapeStartedAt))}; ${csite.pages.length} page(s)`);

          const competitorPageSpeedStartedAt = Date.now();
          const cps = await withTimeout(
            `Competitor ${competitorNumber} PageSpeed`,
            105_000,
            runPageSpeed(csite.pages.map(p => p.url), 'quick_win', id, `competitor_${competitorNumber}`),
          ).catch(error => {
            console.warn(`[audit ${id}] [${tier}] [competitor ${competitorNumber}] PageSpeed failed after ${formatMs(elapsedMs(competitorPageSpeedStartedAt))}; continuing`, error);
            return [];
          });
          console.info(`[audit ${id}] [${tier}] [competitor ${competitorNumber}] PageSpeed finished in ${formatMs(elapsedMs(competitorPageSpeedStartedAt))}; ${cps.length} result(s)`);

          competitors.push({ url: safe, site: csite, pageSpeed: cps });
          console.info(`[audit ${id}] [${tier}] [competitor ${competitorNumber}] complete in ${formatMs(elapsedMs(competitorStartedAt))}`);
        } catch (error) {
          console.warn(`[audit ${id}] [${tier}] [competitor ${competitorNumber}] skipped after ${formatMs(elapsedMs(competitorStartedAt))}`, error);
        }
      }

      console.info(`[audit ${id}] [${tier}] [competitors] finished in ${formatMs(elapsedMs(competitorsStartedAt))}; ${competitors.length} competitor(s) available`);
    }

    currentStage = 'persist_llm_stage';
    const llmStagePersistStartedAt = Date.now();
    await touchAudit(id, {
      pagespeed_data: pageSpeed,
      competitor_data: competitors,
      input_data: {
        ...(audit.input_data ?? {}),
        pipelineStage: 'llm_analysis',
        pipelineStageStartedAt: new Date().toISOString(),
      },
    });
    console.info(`[audit ${id}] [${tier}] [database] LLM stage persisted in ${formatMs(elapsedMs(llmStagePersistStartedAt))}`);

    currentStage = 'llm_analysis';
    const customerContext = audit.input_data?.buyerInputs ?? undefined;
    const llmStartedAt = Date.now();
    console.info(`[audit ${id}] [${tier}] [llm] analysis started; pages=${site.pages.length}, pagespeedResults=${pageSpeed.length}, competitors=${competitors.length}`);
    // Provider calls have their own abort/retry ceilings. Do not wrap the whole
    // provider/fallback sequence in the old 180s synchronous-function timeout;
    // the Netlify Background Function now owns the long-running job lifecycle.
    const analysis = await analyzeAudit({ tier, site, pageSpeed, competitors, customerContext }, id);
    console.info(`[audit ${id}] [${tier}] [llm] analysis complete in ${formatMs(elapsedMs(llmStartedAt))}; overallScore=${analysis.overallScore}, actionItems=${analysis.actionItems.length}, quickWins=${analysis.quickWins.length}`);

    currentStage = 'persist_pdf_stage';
    const pdfStagePersistStartedAt = Date.now();
    await updateAudit(id, 'generating_pdf', {
      analysis,
      input_data: {
        ...(audit.input_data ?? {}),
        pipelineStage: 'pdf',
        pipelineStageStartedAt: new Date().toISOString(),
      },
    });
    console.info(`[audit ${id}] [${tier}] [database] PDF stage persisted in ${formatMs(elapsedMs(pdfStagePersistStartedAt))}`);

    currentStage = 'report_html';
    const htmlStartedAt = Date.now();
    const html = renderReportHtml({ analysis, site, pageSpeed, tier, createdAt: audit.created_at, competitors });
    console.info(`[audit ${id}] [${tier}] [report_html] rendered in ${formatMs(elapsedMs(htmlStartedAt))}; htmlChars=${html.length}`);

    currentStage = 'pdf_generation';
    const pdfStartedAt = Date.now();
    console.info(`[audit ${id}] [${tier}] [pdf] generation started`);
    const pdf = await withTimeout('PDF generation', 120_000, htmlToPdf(html));
    console.info(`[audit ${id}] [${tier}] [pdf] generation complete in ${formatMs(elapsedMs(pdfStartedAt))}; sizeBytes=${pdf.byteLength}, sizeMB=${(pdf.byteLength / 1024 / 1024).toFixed(2)}`);

    const etsyMaxFileBytes = 20 * 1024 * 1024;
    if (audit.source === 'etsy' && pdf.byteLength > etsyMaxFileBytes) {
      throw new Error(`Generated PDF is ${(pdf.byteLength / 1024 / 1024).toFixed(1)} MB, above Etsy's 20 MB per-file limit for digital order uploads.`);
    }

    currentStage = 'report_upload';
    const uploadStartedAt = Date.now();
    console.info(`[audit ${id}] [${tier}] [upload] started`);
    const uploaded = await withTimeout('Report upload', 60_000, uploadReport(id, pdf));
    console.info(`[audit ${id}] [${tier}] [upload] complete in ${formatMs(elapsedMs(uploadStartedAt))}; path=${uploaded.path}`);

    currentStage = 'admin_notification';
    const notificationStartedAt = Date.now();
    try {
      const notified = await notifyAdmin({
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
      console.info(`[audit ${id}] [${tier}] [notification] finished in ${formatMs(elapsedMs(notificationStartedAt))}; sent=${notified}`);
    } catch (notificationError) {
      console.error(`[audit ${id}] [${tier}] [notification] failed after ${formatMs(elapsedMs(notificationStartedAt))}; report remains available`, notificationError);
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

    currentStage = 'final_database_update';
    const finalUpdateStartedAt = Date.now();
    if (audit.source === 'etsy') {
      await updateAudit(id, 'awaiting_etsy_upload', completePatch);
    } else {
      await updateAudit(id, 'completed', {
        ...completePatch,
        completed_at: new Date().toISOString(),
      });
    }
    console.info(`[audit ${id}] [${tier}] [database] final status persisted in ${formatMs(elapsedMs(finalUpdateStartedAt))}`);
    console.info(`[audit ${id}] [${tier}] [pipeline] COMPLETE in ${formatMs(elapsedMs(pipelineStartedAt))}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[audit ${id}] [${tier ?? 'unknown-tier'}] [pipeline] FAILED at stage=${currentStage} after ${formatMs(elapsedMs(pipelineStartedAt))}: ${message}`, err);

    const failedUpdateStartedAt = Date.now();
    await updateAudit(id, 'failed', {
      error_message: message.slice(0, 2000),
      input_data: {
        ...(audit.input_data ?? {}),
        pipelineStage: 'failed',
        pipelineStageStartedAt: new Date().toISOString(),
        pipelineFailedAtStage: currentStage,
      },
    });
    console.info(`[audit ${id}] [${tier ?? 'unknown-tier'}] [database] failed status persisted in ${formatMs(elapsedMs(failedUpdateStartedAt))}`);
    throw err;
  }
}
