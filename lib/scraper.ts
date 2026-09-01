import type { AuditTier, PageAudit, SiteScrape } from './types';
import { launchBrowser, hardenPage } from './browser';
import { assertPublicUrl } from './url-security';

const limits: Record<AuditTier, number> = { quick_win: 1, full_site: 5, competitor_conquest: 10 };

function scrapePrefix(auditId?: string, scope = 'target') {
  return `${auditId ? `[audit ${auditId}] ` : ''}[scraper:${scope}]`;
}

async function fetchText(url: string, maxChars = 120000) {
  try {
    await assertPublicUrl(url);
    const r = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(10000),
      headers: { 'user-agent': 'MsSaraJoAuditBot/1.0' },
    });
    return r.ok ? (await r.text()).slice(0, maxChars) : null;
  } catch { return null; }
}

function canonicalHost(hostname: string) {
  return hostname.toLowerCase().replace(/^www\./, '');
}

function sameSite(raw: string, reference: string) {
  try {
    const a = new URL(raw);
    const b = new URL(reference);
    return canonicalHost(a.hostname) === canonicalHost(b.hostname);
  } catch { return false; }
}

function normalizedInternal(raw: string, origin: string) {
  try {
    const u = new URL(raw, origin);
    if (!['http:', 'https:'].includes(u.protocol) || !sameSite(u.toString(), origin)) return null;
    u.hash = '';
    // Tracking/query variants should not consume one of the limited audit pages.
    u.search = '';
    if (/\.(pdf|jpg|jpeg|png|gif|webp|svg|zip|xml)$/i.test(u.pathname)) return null;
    return u.toString();
  } catch { return null; }
}

function pageKind(url: string) {
  const p = new URL(url).pathname.toLowerCase();
  if (p === '/' || p === '') return 'home';
  if (/\/(about|our-story|story|company|team)(\/|$)/.test(p)) return 'about';
  if (/\/(services?|solutions?|offerings?)(\/|$)/.test(p)) return 'services';
  if (/\/(collections?|shop|store|catalog)(\/|$)/.test(p)) return 'collection';
  if (/\/(products?|product)(\/|$)/.test(p)) return 'product';
  if (/\/(contact|book|booking|consult)(\/|$)/.test(p)) return 'contact';
  if (/\/(faq|faqs|help)(\/|$)/.test(p)) return 'faq';
  if (/\/(pricing|plans)(\/|$)/.test(p)) return 'pricing';
  if (/\/(portfolio|work|case-studies|case-study)(\/|$)/.test(p)) return 'proof';
  if (/\/(blog|blogs|articles?|news)(\/|$)/.test(p)) return 'content';
  return 'other';
}

function candidateScore(url: string, usedKinds: Set<string>) {
  const p = new URL(url).pathname.toLowerCase();
  if (/\/(cart|checkout|account|login|sign-in|search)(\/|$)/.test(p)) return -1000;
  if (/\/(?:_[^/]+|wp-json|feed|tag|author|attachment)(\/|$)/.test(p)) return -900;
  if (/\/(privacy|terms|shipping|returns?|refund|polic(y|ies)|legal|accessibility-statement)(\/|$)/.test(p)) return -500;
  const kind = pageKind(url);
  const base: Record<string, number> = {
    home: 1000, services: 940, collection: 900, product: 860, about: 830,
    contact: 790, pricing: 780, proof: 760, faq: 710, content: 500, other: 600,
  };
  // For the 5-page tier, diversity is more useful than five nearly identical product URLs.
  const diversityBonus = usedKinds.has(kind) && !['home', 'other'].includes(kind) ? -180 : 0;
  const depthPenalty = Math.max(0, p.split('/').filter(Boolean).length - 2) * 20;
  return (base[kind] ?? 600) + diversityBonus - depthPenalty;
}


function isUtilityEndpoint(url: string, data: { wordCount: number; forms: number; h1: string[]; textSample: string; title: string }) {
  try {
    const path = new URL(url).pathname.toLowerCase();
    const utilityPath = /\/(files?|uploads?|media|assets?|api|wp-json|feed|toolkit|_toolkit)(\/|$)/.test(path);
    const rawLike = /^[\s]*[\[{]/.test(data.textSample || '') || /application\/(json|xml)/i.test(data.title || '');
    const noPageStructure = data.forms === 0 && data.h1.length === 0;
    return noPageStructure && (utilityPath || rawLike) && data.wordCount < 2500;
  } catch { return false; }
}

function sitemapUrls(xml: string, origin: string) {
  const urls: string[] = [];
  for (const m of xml.matchAll(/<loc[^>]*>([\s\S]*?)<\/loc>/gi)) {
    const value = m[1].replace(/&amp;/g, '&').trim();
    try {
      const u = new URL(value);
      if (sameSite(u.toString(), origin)) urls.push(u.toString());
    } catch { /* ignore */ }
  }
  return urls;
}

async function discoverFromSitemaps(root: string, robotsTxt: string | null) {
  const origin = new URL(root).origin;
  const sitemapDocs = new Set<string>();
  for (const line of (robotsTxt || '').split(/\r?\n/)) {
    const m = line.match(/^\s*sitemap\s*:\s*(\S+)/i);
    if (m) sitemapDocs.add(m[1]);
  }
  sitemapDocs.add(`${origin}/sitemap.xml`);
  sitemapDocs.add(`${origin}/sitemap_index.xml`);

  const pageCandidates = new Set<string>();
  const pending = [...sitemapDocs].slice(0, 8);
  const fetched = new Set<string>();
  while (pending.length && fetched.size < 12 && pageCandidates.size < 160) {
    const docUrl = pending.shift()!;
    if (fetched.has(docUrl)) continue;
    fetched.add(docUrl);
    const xml = await fetchText(docUrl, 180000);
    if (!xml) continue;
    for (const found of sitemapUrls(xml, origin)) {
      if (/\.xml(?:$|\?)/i.test(found)) {
        if (!fetched.has(found) && pending.length < 8) pending.push(found);
      } else {
        const normalized = normalizedInternal(found, origin);
        if (normalized) pageCandidates.add(normalized);
      }
    }
  }
  return [...pageCandidates];
}

export async function scrapeSite(
  start: string,
  tier: AuditTier,
  auditId?: string,
  scope = 'target',
): Promise<SiteScrape> {
  const prefix = scrapePrefix(auditId, scope);
  const scrapeStartedAt = Date.now();
  console.info(`${prefix} scrape started; tier=${tier}, pageLimit=${limits[tier]}, start=${start}`);

  const validationStartedAt = Date.now();
  const startUrl = await assertPublicUrl(start);
  console.info(`${prefix} start URL validated in ${Date.now() - validationStartedAt}ms: ${startUrl}`);

  const origin = new URL(startUrl).origin;
  const root = origin;

  const robotsStartedAt = Date.now();
  const robotsTxt = await fetchText(`${root}/robots.txt`);
  console.info(`${prefix} robots.txt fetch finished in ${Date.now() - robotsStartedAt}ms; found=${Boolean(robotsTxt)}`);

  const sitemapStartedAt = Date.now();
  const sitemapCandidates = tier === 'quick_win' ? [] : await discoverFromSitemaps(root, robotsTxt);
  console.info(`${prefix} sitemap discovery finished in ${Date.now() - sitemapStartedAt}ms; candidates=${sitemapCandidates.length}`);

  const browserStartedAt = Date.now();
  console.info(`${prefix} launching browser`);
  const browser = await launchBrowser();
  console.info(`${prefix} browser launched in ${Date.now() - browserStartedAt}ms`);
  const candidates = new Set<string>([startUrl]);
  sitemapCandidates.forEach(url => candidates.add(url));
  const seen = new Set<string>();
  const usedKinds = new Set<string>();
  const pages: PageAudit[] = [];
  const utilityFindings: PageAudit[] = [];

  try {
    while (pages.length < limits[tier]) {
      const available = [...candidates]
        .filter(url => !seen.has(url))
        .sort((a, b) => candidateScore(b, usedKinds) - candidateScore(a, usedKinds));
      if (!available.length) break;

      const raw = available[0];
      let target: string;
      try { target = await assertPublicUrl(raw); } catch { seen.add(raw); continue; }
      const normalized = normalizedInternal(target, origin);
      if (!normalized || seen.has(normalized)) { seen.add(raw); continue; }
      target = normalized;
      seen.add(target);

      const pageStartedAt = Date.now();
      console.info(`${prefix} rendering ${target}; acceptedPages=${pages.length}/${limits[tier]}, seen=${seen.size}, candidates=${candidates.size}`);
      const page = await browser.newPage();
      await page.setViewport({ width: 1440, height: 1100 });
      await page.setUserAgent('Mozilla/5.0 (compatible; MsSaraJoAuditBot/1.0)');
      await hardenPage(page);
      try {
        await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30000 });
        // Give hydrated navigation a chance to appear without requiring network-idle,
        // which many modern sites never reach because of analytics/polling.
        await new Promise(resolve => setTimeout(resolve, 1400));
        const data = await page.evaluate(() => {
          const text = (document.body?.innerText || '').replace(/\s+/g, ' ').trim();
          const allLinks = [...document.querySelectorAll<HTMLAnchorElement>('a[href]')]
            .map(a => a.href).filter(Boolean);
          const origin = location.origin;
          const internal = allLinks.filter(h => { try { return new URL(h).origin === origin; } catch { return false; } });
          const external = allLinks.filter(h => { try { return ['http:', 'https:'].includes(new URL(h).protocol) && new URL(h).origin !== origin; } catch { return false; } });
          const ldTypes: string[] = [];
          document.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]').forEach(el => {
            try {
              const json = JSON.parse(el.textContent || '{}');
              const items = Array.isArray(json) ? json : [json];
              for (const item of items) {
                const t = item?.['@type'];
                if (Array.isArray(t)) ldTypes.push(...t.map(String)); else if (t) ldTypes.push(String(t));
              }
            } catch { /* ignore malformed schema */ }
          });
          return {
            title: document.title || '',
            metaDescription: document.querySelector<HTMLMetaElement>('meta[name="description"]')?.content || '',
            canonical: document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href || null,
            robotsMeta: document.querySelector<HTMLMetaElement>('meta[name="robots"]')?.content || null,
            viewport: document.querySelector<HTMLMetaElement>('meta[name="viewport"]')?.content || null,
            h1: [...document.querySelectorAll('h1')].map(x => (x.textContent || '').trim()).filter(Boolean).slice(0, 8),
            h2: [...document.querySelectorAll('h2')].map(x => (x.textContent || '').trim()).filter(Boolean).slice(0, 15),
            textSample: text.slice(0, 12000),
            internalLinks: [...new Set(internal)].slice(0, 160),
            externalLinks: [...new Set(external)].slice(0, 40),
            imageCount: document.images.length,
            imagesMissingAlt: [...document.images].filter(i => !i.getAttribute('alt')?.trim()).length,
            buttons: [...document.querySelectorAll('button, a[role="button"], input[type="submit"]')].map(x => ((x as HTMLElement).innerText || (x as HTMLInputElement).value || '').trim()).filter(Boolean).slice(0, 30),
            forms: document.forms.length,
            jsonLdTypes: [...new Set(ldTypes)].slice(0, 30),
            wordCount: text ? text.split(/\s+/).length : 0,
            lang: document.documentElement.lang || null,
          };
        });

        const finalUrl = normalizedInternal(page.url(), origin) || target;
        // Do not spend one of the Comprehensive tier's five slots on nearly empty
        // utility URLs. This catches orphaned toolkit/placeholder routes that may
        // appear in a sitemap but are not strategically useful client pages. Keep
        // short contact/booking pages when they contain a form or a real H1.
        const thinUtility = tier !== 'quick_win'
          && pageKind(finalUrl) === 'other'
          && data.wordCount < 60
          && data.forms === 0
          && data.h1.length === 0;
        // Comprehensive promises up to five meaningful visitor-facing pages.
        // Utility/API/media-library endpoints can still be discovered as technical
        // evidence, but they must not consume one of those five purchased slots.
        const quotaUtility = tier === 'full_site' && isUtilityEndpoint(finalUrl, data);
        if (!pages.some(p => p.url === finalUrl) && !thinUtility && !quotaUtility) {
          pages.push({ url: finalUrl, ...data });
          usedKinds.add(pageKind(finalUrl));
        } else if (thinUtility || quotaUtility) {
          if (quotaUtility && !utilityFindings.some(p => p.url === finalUrl)) {
            utilityFindings.push({ url: finalUrl, ...data });
          }
          console.info(`${prefix} skipped non-client-page candidate ${finalUrl} (${data.wordCount} words)`);
        }
        for (const link of data.internalLinks) {
          const normalizedLink = normalizedInternal(link, origin);
          if (normalizedLink && !seen.has(normalizedLink)) candidates.add(normalizedLink);
        }
        console.info(`${prefix} rendered ${target} in ${Date.now() - pageStartedAt}ms; finalUrl=${finalUrl}, words=${data.wordCount}, internalLinks=${data.internalLinks.length}, acceptedPages=${pages.length}/${limits[tier]}`);
      } catch (error) {
        // A broken candidate should not prevent the crawler from trying the next page.
        console.warn(`${prefix} could not render ${target} after ${Date.now() - pageStartedAt}ms`, error);
      } finally {
        await page.close();
      }
    }
  } finally {
    await Promise.race([
      browser.close(),
      new Promise<void>(resolve => setTimeout(resolve, 10_000)),
    ]).catch(() => undefined);
  }

  if (!pages.length) throw new Error('Could not render the target website');

  const llmsStartedAt = Date.now();
  const llmsTxt = await fetchText(`${root}/llms.txt`);
  console.info(`${prefix} llms.txt fetch finished in ${Date.now() - llmsStartedAt}ms; found=${Boolean(llmsTxt)}`);

  console.info(`${prefix} scrape complete in ${Date.now() - scrapeStartedAt}ms; pages=${pages.length}, utilityFindings=${utilityFindings.length}, sitemapCandidates=${sitemapCandidates.length}`);
  return { startUrl, pages, utilityFindings, robotsTxt, llmsTxt, hasSitemap: /sitemap:/i.test(robotsTxt || '') || sitemapCandidates.length > 0 };
}
