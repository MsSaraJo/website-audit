import type { AuditTier, PageAudit, SiteScrape } from './types';
import { launchBrowser, hardenPage } from './browser';
import { assertPublicUrl } from './url-security';

const limits: Record<AuditTier, number> = { quick_win: 1, full_site: 5, competitor_conquest: 10 };

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

function normalizedInternal(raw: string, origin: string) {
  try {
    const u = new URL(raw, origin);
    if (!['http:', 'https:'].includes(u.protocol) || u.origin !== origin) return null;
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

function sitemapUrls(xml: string, origin: string) {
  const urls: string[] = [];
  for (const m of xml.matchAll(/<loc[^>]*>([\s\S]*?)<\/loc>/gi)) {
    const value = m[1].replace(/&amp;/g, '&').trim();
    try {
      const u = new URL(value);
      if (u.origin === origin) urls.push(u.toString());
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

  const pageCandidates = new Set<string>();
  const pending = [...sitemapDocs].slice(0, 5);
  const fetched = new Set<string>();
  while (pending.length && fetched.size < 6 && pageCandidates.size < 120) {
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

export async function scrapeSite(start: string, tier: AuditTier): Promise<SiteScrape> {
  const startUrl = await assertPublicUrl(start);
  const origin = new URL(startUrl).origin;
  const root = origin;
  const robotsTxt = await fetchText(`${root}/robots.txt`);
  const sitemapCandidates = tier === 'quick_win' ? [] : await discoverFromSitemaps(root, robotsTxt);

  const browser = await launchBrowser();
  const candidates = new Set<string>([startUrl]);
  sitemapCandidates.forEach(url => candidates.add(url));
  const seen = new Set<string>();
  const usedKinds = new Set<string>();
  const pages: PageAudit[] = [];

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

      const page = await browser.newPage();
      await page.setViewport({ width: 1440, height: 1100 });
      await page.setUserAgent('Mozilla/5.0 (compatible; MsSaraJoAuditBot/1.0; +https://saraejohnston.com)');
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
        if (!pages.some(p => p.url === finalUrl)) {
          pages.push({ url: finalUrl, ...data });
          usedKinds.add(pageKind(finalUrl));
        }
        for (const link of data.internalLinks) {
          const normalizedLink = normalizedInternal(link, origin);
          if (normalizedLink && !seen.has(normalizedLink)) candidates.add(normalizedLink);
        }
      } catch {
        // A broken candidate should not prevent the crawler from trying the next page.
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }

  if (!pages.length) throw new Error('Could not render the target website');
  const llmsTxt = await fetchText(`${root}/llms.txt`);
  return { startUrl, pages, robotsTxt, llmsTxt, hasSitemap: /sitemap:/i.test(robotsTxt || '') || sitemapCandidates.length > 0 };
}
