import type { AuditTier, PageAudit, SiteScrape } from './types';
import { launchBrowser, hardenPage } from './browser';
import { assertPublicUrl } from './url-security';

const limits: Record<AuditTier, number> = { quick_win: 1, full_site: 5, competitor_conquest: 10 };

async function fetchText(url: string) {
  try {
    await assertPublicUrl(url);
    const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(8000), headers: { 'user-agent': 'MsSaraJoAuditBot/1.0' } });
    return r.ok ? (await r.text()).slice(0, 50000) : null;
  } catch { return null; }
}

export async function scrapeSite(start: string, tier: AuditTier): Promise<SiteScrape> {
  const startUrl = await assertPublicUrl(start);
  const browser = await launchBrowser();
  const queue = [startUrl];
  const seen = new Set<string>();
  const pages: PageAudit[] = [];
  const origin = new URL(startUrl).origin;

  try {
    while (queue.length && pages.length < limits[tier]) {
      const raw = queue.shift()!;
      let target: string;
      try { target = await assertPublicUrl(raw); } catch { continue; }
      const u = new URL(target); u.hash = '';
      target = u.toString();
      if (seen.has(target) || u.origin !== origin) continue;
      seen.add(target);

      const page = await browser.newPage();
      await page.setViewport({ width: 1440, height: 1100 });
      await page.setUserAgent('Mozilla/5.0 (compatible; MsSaraJoAuditBot/1.0; +https://example.com/bot)');
      await hardenPage(page);
      try {
        await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await new Promise(resolve => setTimeout(resolve, 900));
        const data = await page.evaluate(() => {
          const text = (document.body?.innerText || '').replace(/\s+/g, ' ').trim();
          const allLinks = [...document.querySelectorAll<HTMLAnchorElement>('a[href]')].map(a => a.href).filter(Boolean);
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
            internalLinks: [...new Set(internal)].slice(0, 80),
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
        pages.push({ url: page.url(), ...data });
        for (const link of data.internalLinks) {
          try {
            const linkUrl = new URL(link); linkUrl.hash = '';
            if (linkUrl.origin === origin && !seen.has(linkUrl.toString()) && !/\.(pdf|jpg|jpeg|png|gif|webp|svg|zip)$/i.test(linkUrl.pathname)) queue.push(linkUrl.toString());
          } catch { /* ignore */ }
        }
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }

  if (!pages.length) throw new Error('Could not render the target website');
  const root = new URL(startUrl).origin;
  const [robotsTxt, llmsTxt] = await Promise.all([fetchText(`${root}/robots.txt`), fetchText(`${root}/llms.txt`)]);
  return { startUrl, pages, robotsTxt, llmsTxt, hasSitemap: /sitemap:/i.test(robotsTxt || '') };
}
