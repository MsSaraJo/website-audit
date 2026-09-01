import { env } from './env';
import type { AuditTier, PageSpeedSummary } from './types';

const pageLimits: Record<AuditTier, number> = { quick_win: 1, full_site: 3, competitor_conquest: 5 };

function score(v: unknown): number | null {
  return typeof v === 'number' ? Math.round(v * 100) : null;
}

export async function runPageSpeed(urls: string[], tier: AuditTier): Promise<PageSpeedSummary[]> {
  const targets = urls.slice(0, pageLimits[tier]);
  const jobs = targets.flatMap(url => (['mobile', 'desktop'] as const).map(strategy => runOne(url, strategy)));
  const settled = await Promise.allSettled(jobs);
  return settled.flatMap(x => x.status === 'fulfilled' ? [x.value] : []);
}

async function runOne(url: string, strategy: 'mobile' | 'desktop'): Promise<PageSpeedSummary> {
  const endpoint = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
  endpoint.searchParams.set('url', url);
  endpoint.searchParams.set('strategy', strategy);
  for (const c of ['performance', 'accessibility', 'best-practices', 'seo']) endpoint.searchParams.append('category', c);
  if (env.PAGESPEED_API_KEY) endpoint.searchParams.set('key', env.PAGESPEED_API_KEY);
  const res = await fetch(endpoint, { signal: AbortSignal.timeout(90000) });
  if (!res.ok) throw new Error(`PageSpeed ${res.status}: ${(await res.text()).slice(0, 300)}`);
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
  return {
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
}
