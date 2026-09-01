import { env } from './env';
import type { AuditTier, PageSpeedSummary } from './types';

const pageLimits: Record<AuditTier, number> = { quick_win: 1, full_site: 3, competitor_conquest: 5 };

function score(v: unknown): number | null {
  return typeof v === 'number' ? Math.round(v * 100) : null;
}

function contextPrefix(auditId?: string, scope = 'target') {
  return `${auditId ? `[audit ${auditId}] ` : ''}[pagespeed:${scope}]`;
}

export async function runPageSpeed(
  urls: string[],
  tier: AuditTier,
  auditId?: string,
  scope = 'target',
): Promise<PageSpeedSummary[]> {
  const prefix = contextPrefix(auditId, scope);
  const batchStartedAt = Date.now();
  const targets = urls.slice(0, pageLimits[tier]);
  console.info(`${prefix} batch started; tier=${tier}, requestedUrls=${urls.length}, measuredUrls=${targets.length}, jobs=${targets.length * 2}`);

  const jobs = targets.flatMap(url => (['mobile', 'desktop'] as const).map(strategy => runOne(url, strategy, auditId, scope)));
  const settled = await Promise.allSettled(jobs);
  const fulfilled = settled.flatMap(x => x.status === 'fulfilled' ? [x.value] : []);
  const rejected = settled.length - fulfilled.length;

  console.info(`${prefix} batch complete in ${Date.now() - batchStartedAt}ms; fulfilled=${fulfilled.length}, rejected=${rejected}`);
  return fulfilled;
}

async function runOne(
  url: string,
  strategy: 'mobile' | 'desktop',
  auditId?: string,
  scope = 'target',
): Promise<PageSpeedSummary> {
  const prefix = contextPrefix(auditId, scope);
  const startedAt = Date.now();
  console.info(`${prefix} ${strategy} request started: ${url}`);

  try {
    const endpoint = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
    endpoint.searchParams.set('url', url);
    endpoint.searchParams.set('strategy', strategy);
    for (const c of ['performance', 'accessibility', 'best-practices', 'seo']) endpoint.searchParams.append('category', c);
    if (env.PAGESPEED_API_KEY) endpoint.searchParams.set('key', env.PAGESPEED_API_KEY);

    const fetchStartedAt = Date.now();
    const res = await fetch(endpoint, { signal: AbortSignal.timeout(90000) });
    console.info(`${prefix} ${strategy} HTTP response received in ${Date.now() - fetchStartedAt}ms; status=${res.status}: ${url}`);

    if (!res.ok) throw new Error(`PageSpeed ${res.status}: ${(await res.text()).slice(0, 300)}`);

    const parseStartedAt = Date.now();
    const json = await res.json();
    const lhr = json.lighthouseResult ?? {};
    const categories = lhr.categories ?? {};
    const audits = lhr.audits ?? {};
    const metricIds = ['first-contentful-paint', 'largest-contentful-paint', 'total-blocking-time', 'cumulative-layout-shift', 'speed-index', 'interactive'];
    const metrics: Record<string, string | number | null> = {};
    for (const id of metricIds) metrics[id] = audits[id]?.displayValue ?? audits[id]?.numericValue ?? null;
    const opportunities = Object.values(audits as Record<string, any>)
      .filter((a: any) => a?.details?.type === 'opportunity' && typeof a.score === 'number' && a.score < 0.9)
      .sort((a: any, b: any) => (b.details?.overallSavingsMs ?? 0) - (a.details?.overallSavingsMs ?? 0))
      .slice(0, 10)
      .map((a: any) => ({ id: a.id, title: a.title, displayValue: a.displayValue, score: a.score }));

    const result: PageSpeedSummary = {
      url,
      strategy,
      scores: {
        performance: score(categories.performance?.score),
        accessibility: score(categories.accessibility?.score),
        bestPractices: score(categories['best-practices']?.score),
        seo: score(categories.seo?.score),
      },
      metrics,
      opportunities,
    };

    console.info(`${prefix} ${strategy} complete in ${Date.now() - startedAt}ms; parse=${Date.now() - parseStartedAt}ms; performance=${result.scores.performance}, accessibility=${result.scores.accessibility}, seo=${result.scores.seo}: ${url}`);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`${prefix} ${strategy} FAILED after ${Date.now() - startedAt}ms: ${url}; ${message}`, error);
    throw error;
  }
}
