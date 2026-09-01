import type { AuditAnalysis, AuditTier, PageSpeedSummary, SiteScrape } from './types';
import { env } from './env';
import { productForTier } from './products';

const e = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' }[c]!));

const scoreLabels: Record<string, string> = {
  seo: 'SEO',
  performance: 'Performance',
  ux: 'User experience',
  accessibility: 'Accessibility',
  geo: 'AI readiness',
};

const scoreOrder = ['performance', 'seo', 'ux', 'accessibility', 'geo'] as const;

type ScoreStatus = { label: string; className: 'excellent' | 'strong' | 'foundation' | 'opportunity' | 'priority' };
function scoreStatus(value: number): ScoreStatus {
  if (value >= 80) return { label: 'Excellent', className: 'excellent' };
  if (value >= 75) return { label: 'Strong', className: 'strong' };
  if (value >= 65) return { label: 'Good foundation', className: 'foundation' };
  if (value >= 50) return { label: 'Opportunity', className: 'opportunity' };
  return { label: 'Priority attention', className: 'priority' };
}

function pathFor(url: string) {
  try { return new URL(url).pathname || '/'; } catch { return url; }
}
function displayPage(url: string) {
  const p = pathFor(url);
  return p === '/' ? 'Homepage' : p;
}
function hostFor(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}
function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function brandNameHtml() {
  const name = env.REPORT_BRAND_NAME || 'MsSaraJo';
  if (name.toLowerCase() === 'mssarajo') {
    return `<span class="brand-ms">Ms</span><span class="brand-sara">Sara</span><span class="brand-jo">Jo</span>`;
  }
  return e(name);
}

function coverTitleHtml(tier: AuditTier, fallback: string) {
  if (tier === 'quick_win') return 'Website SEO,<br/>UX &amp;<br/>Conversion Audit';
  if (tier === 'full_site') return 'Comprehensive Website<br/>SEO, UX &amp;<br/>Conversion Audit';
  if (tier === 'competitor_conquest') return 'Website &amp; Competitor<br/>SEO, UX &amp;<br/>Conversion Audit';
  return e(fallback);
}

function sparkle(className = '') {
  return `<svg class="spark-svg ${className}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 0C12.7 7.2 16.8 11.3 24 12C16.8 12.7 12.7 16.8 12 24C11.3 16.8 7.2 12.7 0 12C7.2 11.3 11.3 7.2 12 0Z"/></svg>`;
}

function polarPoint(cx: number, cy: number, radius: number, angleDeg: number) {
  const a = angleDeg * Math.PI / 180;
  return { x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a) };
}

function arcPath(cx: number, cy: number, radius: number, startAngle: number, sweepAngle: number) {
  const start = polarPoint(cx, cy, radius, startAngle);
  const end = polarPoint(cx, cy, radius, startAngle + sweepAngle);
  const largeArc = sweepAngle > 180 ? 1 : 0;
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

function scoreGauge(value: number, variant: 'hero' | 'card') {
  const score = Math.max(0, Math.min(100, Number(value) || 0));
  const cx = 60, cy = 60;
  const radius = variant === 'hero' ? 48 : 42;
  // v3.5: an open editorial arc with a dotted guide, a solid score arc,
  // and ornate sparkles anchored to the actual percentage endpoints.
  // The geometry is shared by every score, so 61%, 72%, 82%, etc. visibly
  // land in different places instead of using decorative fixed positions.
  const startAngle = 140;
  const maxSweep = 280;
  const sweep = Math.max(0.01, maxSweep * (score / 100));
  const start = polarPoint(cx, cy, radius, startAngle);
  const end = polarPoint(cx, cy, radius, startAngle + sweep);
  const companion = polarPoint(cx, cy, radius + (variant === 'hero' ? 8 : 5.5), startAngle + sweep + 9);
  const endScale = variant === 'hero' ? 1.02 : 0.66;
  const startScale = variant === 'hero' ? 0.44 : 0.30;
  const companionScale = variant === 'hero' ? 0.36 : 0.24;
  const ornateStar = 'M0 -9C.8-2.9 2.9-.8 9 0C2.9.8.8 2.9 0 9C-.8 2.9-2.9.8-9 0C-2.9-.8-.8-2.9 0-9Z';
  const tinyStar = 'M0 -7L1.8-1.8L7 0L1.8 1.8L0 7L-1.8 1.8L-7 0L-1.8-1.8Z';
  const track = variant === 'hero'
    ? `<path class="gauge-track" d="${arcPath(cx, cy, radius, startAngle, maxSweep)}"/>`
    : '';
  return `<svg class="score-gauge score-gauge-${variant}" viewBox="0 0 120 120" aria-hidden="true" focusable="false">
    ${track}
    <path class="gauge-progress" d="${arcPath(cx, cy, radius, startAngle, sweep)}"/>
    <g class="gauge-start-spark" transform="translate(${start.x.toFixed(2)} ${start.y.toFixed(2)}) scale(${startScale})"><path d="${ornateStar}"/></g>
    <g class="gauge-end-spark" transform="translate(${end.x.toFixed(2)} ${end.y.toFixed(2)}) scale(${endScale})"><path d="${ornateStar}"/></g>
    <g class="gauge-companion-spark" transform="translate(${companion.x.toFixed(2)} ${companion.y.toFixed(2)}) scale(${companionScale})"><path d="${tinyStar}"/></g>
  </svg>`;
}

function notchedFrame(className = '', aspectRatio = 3) {
  // Keep the corner radius visually circular in wide/tall boxes. The old 100x100
  // viewBox stretched the corner geometry whenever the frame was not square.
  const h = 100;
  const w = Math.max(70, Math.round(h * aspectRatio));
  const r = 12;
  const d = `M${r} 0H${w-r}C${w-r} ${r*.55} ${w-r*.55} ${r} ${w} ${r}V${h-r}C${w-r*.55} ${h-r} ${w-r} ${h-r*.55} ${w-r} ${h}H${r}C${r} ${h-r*.55} ${r*.55} ${h-r} 0 ${h-r}V${r}C${r*.55} ${r} ${r} ${r*.55} ${r} 0Z`;
  return `<svg class="notched-frame ${className}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d="${d}"/></svg>`;
}

function decorativeArc(className = '') {
  return `<svg class="decorative-arc ${className}" viewBox="0 0 100 100" aria-hidden="true" focusable="false"><path d="M8 88A72 72 0 0 0 91 11"/></svg>`;
}

function rewriteNumber(value: number) {
  return `<svg class="rewrite-num" viewBox="0 0 36 36" aria-hidden="true" focusable="false"><circle cx="18" cy="18" r="16.5"/><text x="18" y="22.2" text-anchor="middle">${value}</text></svg>`;
}

function useIcon(kind: 'document' | 'search' | 'sparkle') {
  const inner = kind === 'document'
    ? '<path d="M9 6h6l3 3v9H9zM15 6v4h4M11.5 12h4M11.5 15h4"/>'
    : kind === 'search'
      ? '<circle cx="11" cy="11" r="4.5"/><path d="M14.5 14.5L19 19"/>'
      : '<path d="M12 6c.35 3.55 2.45 5.65 6 6-3.55.35-5.65 2.45-6 6-.35-3.55-2.45-5.65-6-6 3.55-.35 5.65-2.45 6-6Z"/>';
  return `<svg class="use-icon use-icon-${kind}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle class="use-icon-ring" cx="12" cy="12" r="10"/>${inner}</svg>`;
}

function brandLockup() {
  return `<div class="brand-lockup">
    <div class="brand-icon" aria-hidden="true">
      <svg class="brand-browser" viewBox="0 0 62 48" xmlns="http://www.w3.org/2000/svg">
        <rect x="4" y="6" width="40" height="32" rx="5" fill="none" stroke="#17213A" stroke-width="1.8"/>
        <path d="M4 13h40" stroke="#17213A" stroke-width="1.5"/>
        <circle cx="9" cy="9.6" r="1.2" fill="#C97962"/><circle cx="13.5" cy="9.6" r="1.2" fill="#C97962"/><circle cx="18" cy="9.6" r="1.2" fill="#C97962"/>
        <rect x="9" y="18" width="9" height="8" rx="1.5" fill="#E5AA97"/>
        <path d="M23 20h13M23 24h10" stroke="#8A8792" stroke-width="1.4" stroke-linecap="round"/>
        <path d="M9 33l7-5 6 2 7-7" fill="none" stroke="#C97962" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M37 26l12 12 2.5-7.3 6.5-2.7-21-7z" fill="#FCF9F4" stroke="#17213A" stroke-width="1.8" stroke-linejoin="round" transform="rotate(7 47 30)"/>
      </svg>
      ${sparkle('brand-spark brand-spark-one')}${sparkle('brand-spark brand-spark-two')}
    </div>
    <div class="brand-copy"><div class="brand-name">${brandNameHtml()}</div><div class="brand-subtitle">Website insight studio</div></div>
  </div>`;
}

function pageFooter(domain: string, preparedDate: string, pageNumber: number, totalPages: number) {
  return `<footer class="page-footer"><div class="footer-rule"><span></span>${sparkle('footer-spark')}<span></span></div><div class="footer-meta"><span class="footer-domain">${e(domain)}</span><span class="footer-page">PAGE ${pageNumber} OF ${totalPages}</span><span class="footer-date">Prepared ${e(preparedDate)}</span></div></footer>`;
}

function actionStatus(a: AuditAnalysis['actionItems'][number]) {
  if (a.severity === 'good') return { label: 'Strong foundation', cls: 'status-strong' };
  if (a.impact === 'high') return { label: 'High impact', cls: 'status-impact' };
  return { label: 'Improve next', cls: 'status-improve' };
}

function rewriteIntent(kind: 'title' | 'meta' | 'h1' | 'cta') {
  return {
    title: 'Improve click-through rate with clarity, relevance, and stronger search context.',
    meta: 'Showcase value and encourage qualified searchers to visit the page.',
    h1: 'Clarify the page promise and reinforce the primary value proposition.',
    cta: 'Guide visitors toward the most important next action with confidence.',
  }[kind];
}

function summarySupport(score: number) {
  if (score >= 80) return 'Your website is starting from a strong position. The recommendations ahead are designed to protect what is working while sharpening the areas with the greatest upside.';
  if (score >= 65) return 'Your website has a solid foundation with clear opportunities to improve visibility, usability, and conversion performance through focused refinements.';
  return 'Your website has meaningful room to improve, and the roadmap ahead prioritizes the changes most likely to create momentum first.';
}

export function renderReportHtml(input: { analysis: AuditAnalysis; site: SiteScrape; pageSpeed: PageSpeedSummary[]; tier: AuditTier; createdAt: string }) {
  const { analysis, site, pageSpeed, tier } = input;
  const product = productForTier(tier);
  const preparedDate = new Date(input.createdAt).toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'});
  const domain = hostFor(site.startUrl);

  const actionGroups = chunk(analysis.actionItems, 3);
  const rewriteGroups = analysis.rewrites.length ? analysis.rewrites : [];
  const hasCompetitor = tier === 'competitor_conquest' && !!analysis.competitorGap;
  const totalPages = 2 + actionGroups.length + rewriteGroups.length + 1 + (hasCompetitor ? 1 : 0);
  let currentPage = 0;
  const pages: string[] = [];

  const scoreCards = scoreOrder.map(key => {
    const value = analysis.scores[key];
    const status = scoreStatus(value);
    return `<div class="score-card ${status.className}">
      <div class="score-orbit">${scoreGauge(value, 'card')}<span class="score-number">${value}</span></div>
      <div class="score-card-label">${e(scoreLabels[key])}</div>
      <div class="score-status"><span class="status-dot"></span>${e(status.label)}</div>
    </div>`;
  }).join('');

  const priorityItems = analysis.quickWins.slice(0, 3).map((x, i) => `<li><span class="priority-num">${i + 1}</span><span><strong>${e(x)}</strong></span></li>`).join('');

  currentPage++;
  pages.push(`<section class="report-page cover-page">
    <div class="topbar">${brandLockup()}<div class="review-pill">${sparkle('mini-spark')} Personalized website review</div></div>
    <div class="prepared-line">Prepared for ${e(domain)}</div>
    <div class="cover-hero">
      <div class="cover-title-block">
        <h1>${coverTitleHtml(tier, product.clientReportName)}</h1>
        <div class="ornament-rule"><span></span>${sparkle('ornament-spark')}<span></span></div>
        <div class="site-url">${e(site.startUrl)}</div>
      </div>
      <div class="hero-score">
        <div class="score-halo">${scoreGauge(analysis.overallScore, 'hero')}<strong>${analysis.overallScore}</strong></div>
        <div class="score-label">Overall<br/>website score</div>
      </div>
    </div>
    <div class="executive-box">${notchedFrame('executive-frame', 3.0)}
      <div class="box-heading">${sparkle('box-spark')}Executive summary</div>
      <p>${e(analysis.executiveSummary)}</p>
      <p class="support-copy">${e(summarySupport(analysis.overallScore))}</p>
      <div class="executive-stars">${sparkle('executive-star executive-star-one')}${sparkle('executive-star executive-star-two')}${sparkle('executive-star executive-star-three')}</div>
    </div>
    ${pageFooter(domain, preparedDate, currentPage, totalPages)}
  </section>`);

  currentPage++;
  pages.push(`<section class="report-page glance-page">
    <div class="topbar compact">${brandLockup()}<div class="review-pill">${sparkle('mini-spark')} Personalized website review</div></div>
    <div class="prepared-line">Prepared for ${e(domain)}</div>
    <h2 class="hero-heading">Your Website at a Glance</h2>
    <p class="hero-subhead">A high-level snapshot of how your website is performing across the areas that matter most.</p>
    <div class="score-legend">
      <span><i class="legend-dot excellent"></i>Excellent</span><span><i class="legend-dot strong"></i>Strong</span><span><i class="legend-dot foundation"></i>Good foundation</span><span><i class="legend-dot opportunity"></i>Opportunity</span>
    </div>
    <div class="score-grid">${scoreCards}</div>
    <div class="focus-panel">${notchedFrame('focus-frame', 2.75)}
      <div class="focus-title">Where to<br/>focus first<div class="ornament-rule small"><span></span>${sparkle('ornament-spark')}<span></span></div></div>
      <ol>${priorityItems}</ol>
      <div class="focus-stars">${decorativeArc('focus-arc')}${sparkle('focus-star focus-star-one')}${sparkle('focus-star focus-star-two')}${sparkle('focus-star focus-star-three')}</div>
    </div>
    <div class="support-strip"><span class="support-icon">${sparkle('support-spark')}</span><p>${e(summarySupport(analysis.overallScore))}</p></div>
    ${pageFooter(domain, preparedDate, currentPage, totalPages)}
  </section>`);

  actionGroups.forEach((group, groupIndex) => {
    currentPage++;
    const actionHtml = group.map((a, idx) => {
      const n = groupIndex * 3 + idx + 1;
      const status = actionStatus(a);
      return `<article class="roadmap-item">
        <div class="roadmap-number">${String(n).padStart(2, '0')}</div>
        <div class="roadmap-content">
          <div class="roadmap-top"><span class="roadmap-status ${status.cls}">${sparkle('status-spark')}${e(status.label)}</span><span class="roadmap-category">${e(a.category === 'GEO' ? 'AI Readiness' : a.category)}</span></div>
          <h3>${e(a.title)}</h3>
          <div class="roadmap-columns">
            <div><span class="roadmap-label">Why this matters</span><p>${e(a.why)}</p></div>
            <div><span class="roadmap-label">Recommended next step</span><p>${e(a.how)}</p></div>
          </div>
          <div class="roadmap-meta"><span>Impact: ${e(a.impact)}</span><span>Effort: ${e(a.effort)}</span>${a.pageUrl ? `<span>${e(displayPage(a.pageUrl))}</span>` : ''}</div>
        </div>
        <div class="roadmap-flourish">${decorativeArc('roadmap-arc')}${sparkle('roadmap-star roadmap-star-one')}${sparkle('roadmap-star roadmap-star-two')}${sparkle('roadmap-star roadmap-star-three')}</div>
      </article>`;
    }).join('');
    pages.push(`<section class="report-page roadmap-page">
      <div class="topbar compact">${brandLockup()}<div class="page-kicker">${groupIndex === 0 ? 'Personalized website review' : 'Roadmap continued'}</div></div>
      <h2 class="hero-heading">${groupIndex === 0 ? 'Your Website Roadmap' : 'Your Website Roadmap, Continued'}</h2>
      <p class="hero-subhead">A prioritized plan to elevate your website's visibility, user experience, and conversion performance.</p>
      <div class="roadmap-list">${actionHtml}</div>
      <div class="takeaway-box">${notchedFrame('takeaway-frame', 7.1)}<div class="takeaway-left">${sparkle('takeaway-spark')}</div><div class="takeaway-copy"><strong>Focus. Impact. Growth.</strong><div class="takeaway-rule"><span></span>${sparkle('takeaway-rule-spark')}<span></span></div><p>Small, strategic improvements lead to meaningful results. Focus on these priorities first to build momentum, then continue refining for long-term growth.</p></div><div class="takeaway-stars">${sparkle('takeaway-star takeaway-star-one')}${sparkle('takeaway-star takeaway-star-two')}${sparkle('takeaway-star takeaway-star-three')}</div></div>
      ${pageFooter(domain, preparedDate, currentPage, totalPages)}
    </section>`);
  });

  rewriteGroups.forEach((r, idx) => {
    currentPage++;
    const strengths = analysis.actionItems.filter(a => a.severity === 'good').slice(0, 3);
    const strengthHtml = strengths.length ? strengths.map(s => `<li><span class="checkmark">&#10003;</span>${e(s.title)}</li>`).join('') : `<li><span class="checkmark">&#10003;</span>Your site has a useful foundation to build on.</li>`;
    pages.push(`<section class="report-page rewrite-page">
      <div class="topbar compact">${brandLockup()}<div class="review-pill">${sparkle('mini-spark')} Personalized website review</div></div>
      <div class="prepared-line">Prepared for ${e(domain)}</div>
      <h2 class="hero-heading">Ready-to-Use Recommendations</h2>
      <p class="hero-subhead">Polished, ready-to-implement rewrites designed to strengthen search visibility, clarify your message, and drive more conversions.</p>
      <div class="rewrite-layout">
        <div class="rewrite-main">
          <div class="rewrite-item">${rewriteNumber(1)}<div><span class="rewrite-title">Search title</span><blockquote>${e(r.title)}</blockquote><p><b>Intent:</b> ${e(rewriteIntent('title'))}</p></div></div>
          <div class="rewrite-item">${rewriteNumber(2)}<div><span class="rewrite-title">Meta description</span><blockquote>${e(r.metaDescription)}</blockquote><p><b>Intent:</b> ${e(rewriteIntent('meta'))}</p></div></div>
          <div class="rewrite-item">${rewriteNumber(3)}<div><span class="rewrite-title">Primary heading</span><blockquote>${e(r.primaryH1)}</blockquote><p><b>Intent:</b> ${e(rewriteIntent('h1'))}</p></div></div>
          <div class="rewrite-item">${rewriteNumber(4)}<div><span class="rewrite-title">Primary call to action</span><blockquote>${e(r.cta)}</blockquote><p><b>Intent:</b> ${e(rewriteIntent('cta'))}</p></div></div>
        </div>
        <aside class="rewrite-sidebar">
          <div class="use-box">${notchedFrame('use-frame', .72)}<h4>How to use these recommendations</h4><div class="side-heading-rule"><span></span>${sparkle('side-heading-spark')}<span></span></div><ul><li>${useIcon('document')}<span>Copy them into your CMS, theme fields, or SEO plugin.</span></li><li>${useIcon('search')}<span>Keep your brand voice consistent and adjust the tone where needed.</span></li><li>${useIcon('sparkle')}<span>Track performance over time to see what resonates with your audience.</span></li></ul><div class="sidebar-stars">${sparkle('sidebar-star sidebar-star-large')}${sparkle('sidebar-star sidebar-star-small')}</div></div>
          <div class="working-box">${notchedFrame('working-frame', .72)}<h4>What's already working</h4><div class="side-heading-rule"><span></span>${sparkle('side-heading-spark emerald')}<span></span></div><ul>${strengthHtml}</ul><div class="sidebar-stars working-stars">${sparkle('sidebar-star sidebar-star-large')}${sparkle('sidebar-star sidebar-star-small')}</div></div>
        </aside>
      </div>
      <div class="rewrite-page-label">${e(displayPage(r.pageUrl))}</div>
      ${pageFooter(domain, preparedDate, currentPage, totalPages)}
    </section>`);
  });

  if (hasCompetitor && analysis.competitorGap) {
    currentPage++;
    const cg = analysis.competitorGap;
    pages.push(`<section class="report-page competitor-page">
      <div class="topbar compact">${brandLockup()}<div class="page-kicker">Competitive review</div></div>
      <h2 class="hero-heading">Competitive Positioning</h2>
      <p class="hero-subhead">A focused look at where your website already stands out and where competitors reveal the clearest opportunities to win.</p>
      <div class="competitor-summary">${e(cg.summary)}</div>
      <div class="competitor-grid">
        <div class="competitor-card wins"><span class="competitor-label">Where you lead</span><ul>${cg.wins.map(x=>`<li>${e(x)}</li>`).join('')}</ul></div>
        <div class="competitor-card gaps"><span class="competitor-label">Where competitors lead</span><ul>${cg.gaps.map(x=>`<li>${e(x)}</li>`).join('')}</ul></div>
        <div class="competitor-card opportunities"><span class="competitor-label">Best opportunities</span><ul>${cg.opportunities.map(x=>`<li>${e(x)}</li>`).join('')}</ul></div>
      </div>
      <div class="takeaway-box competitor-takeaway">${notchedFrame('takeaway-frame', 7.1)}${sparkle('takeaway-spark emerald')}<div><strong>Where you can win</strong><p>Use these gaps as a prioritization filter: strengthen the areas where competitors are outperforming while preserving the brand and experience advantages that already make your site distinctive.</p></div></div>
      ${pageFooter(domain, preparedDate, currentPage, totalPages)}
    </section>`);
  }

  currentPage++;
  const performanceRows = pageSpeed.map(p => `<tr><td>${e(p.strategy)}</td><td>${e(pathFor(p.url))}</td><td>${p.scores.performance ?? '&mdash;'}</td><td>${p.scores.accessibility ?? '&mdash;'}</td><td>${p.scores.seo ?? '&mdash;'}</td></tr>`).join('');
  pages.push(`<section class="report-page technical-page">
    <div class="topbar compact">${brandLockup()}<div class="page-kicker">Technical reference</div></div>
    <h2 class="hero-heading">Technical Snapshot</h2>
    <p class="hero-subhead">The supporting signals behind your recommendations, summarized for quick reference.</p>
    <div class="technical-card"><h3>PageSpeed snapshot</h3><table><thead><tr><th>Device</th><th>Page</th><th>Performance</th><th>Accessibility</th><th>SEO</th></tr></thead><tbody>${performanceRows}</tbody></table></div>
    <div class="signal-grid">
      <div><strong>${site.pages.length}</strong><span>Page${site.pages.length === 1 ? '' : 's'} reviewed</span></div>
      <div><strong>${site.robotsTxt ? 'Found' : 'Not found'}</strong><span>robots.txt</span></div>
      <div><strong>${site.hasSitemap ? 'Found' : 'Not found'}</strong><span>Sitemap signal</span></div>
      <div><strong>${site.llmsTxt ? 'Found' : 'Not found'}</strong><span>llms.txt</span></div>
    </div>
    <div class="method-note">${sparkle('takeaway-spark')}<div><strong>How to use this page</strong><p>These technical signals are supporting evidence, not the whole story. Your roadmap combines them with on-page structure, usability, conversion cues, and content context to prioritize practical improvements.</p></div></div>
    <p class="disclaimer">This report is an advisory website assessment based on the information available at the time of review. Recommendations support decision-making and do not guarantee search rankings, revenue, accessibility compliance, or platform eligibility.</p>
    ${pageFooter(domain, preparedDate, currentPage, totalPages)}
  </section>`);

  return `<!doctype html><html><head><meta charset="utf-8"><style>
@page{size:A4;margin:0}*{box-sizing:border-box}html{print-color-adjust:exact;-webkit-print-color-adjust:exact}body{margin:0;background:#fff;color:#17213A;font-family:Arial,Helvetica,sans-serif;font-size:11.2px;line-height:1.52}
:root{--navy:#17213A;--ink:#24304A;--terracotta:#C97962;--terracotta-soft:#F3E4DE;--emerald:#1F5A4B;--emerald-2:#2D715F;--sage:#EEF3EE;--sage-deep:#DDE8DF;--blue:#7F94B5;--blue-soft:#EEF2F7;--gold:#B58A4B;--gold-soft:#F7F0E5;--ivory:#FCF9F4;--line:#E7DDD7;--muted:#6E7787;--white:#FFFFFF}
h1,h2,h3,h4,p{margin-top:0}.report-page{width:210mm;height:297mm;padding:14mm 15mm 11mm;background:linear-gradient(180deg,#FDFBF7 0,#FCF9F4 100%);position:relative;overflow:hidden;break-after:page;display:flex;flex-direction:column}.report-page:last-child{break-after:auto}
.report-page:before{content:'';position:absolute;right:-45mm;top:-40mm;width:95mm;height:95mm;border:1px solid rgba(201,121,98,.05);border-radius:50%;pointer-events:none}.topbar{display:flex;align-items:center;justify-content:space-between;position:relative;z-index:2}.topbar.compact{margin-bottom:10mm}.brand-lockup{display:flex;align-items:center;gap:9px}.brand-icon{width:52px;height:42px;position:relative;flex:none}.brand-browser{width:100%;height:100%;display:block}.brand-copy{margin-top:1px}.brand-name{font-family:Georgia,'Times New Roman',serif;font-size:28px;line-height:1;color:var(--navy);letter-spacing:-.035em}.brand-sara{color:var(--terracotta)}.brand-subtitle{font-size:7px;text-transform:uppercase;letter-spacing:.24em;color:var(--navy);margin-top:5px;font-weight:700}.spark-svg{display:block;fill:currentColor;overflow:visible}.brand-spark{position:absolute;color:var(--terracotta)}.brand-spark-one{width:5px;height:5px;right:-8px;top:17px}.brand-spark-two{display:none}
.review-pill,.page-kicker{border:1px solid rgba(201,121,98,.70);border-radius:999px;min-height:10.5mm;padding:7px 18px;color:var(--navy);font-size:8px;letter-spacing:.17em;text-transform:uppercase;font-weight:700;display:flex;align-items:center;justify-content:center;gap:9px;white-space:nowrap}.mini-spark{width:9px;height:9px;color:var(--terracotta);flex:none}.prepared-line{margin-top:22mm;color:#48618B;text-transform:uppercase;letter-spacing:.19em;font-size:8.9px;font-weight:700;position:relative}.prepared-line:after{content:'';display:block;width:52mm;border-top:1px solid rgba(201,121,98,.6);margin-top:6px}
.cover-hero{display:grid;grid-template-columns:minmax(0,1fr) 63mm;gap:8mm;align-items:center;margin-top:12mm}.cover-title-block h1,.hero-heading{font-family:Georgia,'Times New Roman',serif;font-weight:400;color:var(--navy);letter-spacing:-.04em}.cover-title-block h1{font-size:60px;line-height:1.01;margin:0;max-width:116mm}.site-url{font-family:Georgia,'Times New Roman',serif;font-style:italic;color:#3F5D87;font-size:13.8px;margin-top:10px}.ornament-rule{display:flex;align-items:center;gap:7px;width:62mm;margin-top:9px}.ornament-rule span{height:1px;background:rgba(201,121,98,.7);flex:1}.ornament-spark{width:8px;height:8px;color:var(--terracotta);flex:none}.ornament-rule.small{width:36mm;margin:8px auto 0}
.hero-score{text-align:center;align-self:center}.score-halo{width:61mm;height:61mm;position:relative;display:flex;align-items:center;justify-content:center;margin:auto;color:var(--terracotta)}.score-halo strong{font-family:Georgia,'Times New Roman',serif;font-size:78px;line-height:.92;color:var(--navy);font-weight:400;position:relative;z-index:2}.score-gauge{position:absolute;inset:0;width:100%;height:100%;display:block;overflow:visible;pointer-events:none}.score-gauge path{vector-effect:non-scaling-stroke}.gauge-track{fill:none;stroke:currentColor;stroke-width:1.25;stroke-linecap:round;stroke-dasharray:.1 5.2;opacity:.72}.gauge-progress{fill:none;stroke:currentColor;stroke-width:1.65;stroke-linecap:round;opacity:.96}.gauge-start-spark,.gauge-end-spark{fill:currentColor}.gauge-companion-spark{fill:var(--navy)}.score-gauge-hero .gauge-progress{stroke-width:1.9}.score-gauge-hero .gauge-track{stroke-width:1.35;stroke-dasharray:.1 6;opacity:.68}.score-gauge-hero .gauge-companion-spark{fill:var(--navy)}.score-label{text-transform:uppercase;letter-spacing:.17em;font-size:8.6px;line-height:1.6;margin-top:2px;color:var(--navy)}
.notched-frame{position:absolute;inset:0;width:100%;height:100%;z-index:0;pointer-events:none;overflow:visible}.notched-frame path{vector-effect:non-scaling-stroke;stroke-width:.65;fill:rgba(255,255,255,.18);stroke:rgba(201,121,98,.48)}.executive-box{margin-top:17mm;padding:9mm 10mm 8mm;position:relative;min-height:61mm}.executive-box>*:not(.notched-frame){position:relative;z-index:1}.executive-frame path{fill:rgba(255,255,255,.20);stroke:rgba(201,121,98,.48)}.box-heading{text-transform:uppercase;letter-spacing:.18em;color:var(--navy);font-size:9.2px;display:flex;align-items:center;gap:7px}.box-spark{width:13px;height:13px;color:var(--terracotta);flex:none}.executive-box p{font-family:Georgia,'Times New Roman',serif;font-size:12.8px;line-height:1.62;margin:11px 25mm 0 0}.executive-box .support-copy{margin-top:8px}.executive-box>.executive-stars{position:absolute;right:9mm;top:13mm;width:22mm;height:31mm}.executive-star{position:absolute;color:var(--terracotta)}.executive-star-one{width:28px;height:28px;right:3mm;top:1mm}.executive-star-two{width:12px;height:12px;right:0;bottom:4mm;color:var(--navy)}.executive-star-three{width:9px;height:9px;left:1mm;bottom:1mm}
.page-footer{margin-top:auto;padding-top:3mm;font-family:Georgia,'Times New Roman',serif;font-style:italic;color:#314766;font-size:8px}.footer-rule{display:flex;align-items:center;gap:7px;margin-bottom:3mm}.footer-rule span{height:1px;flex:1;background:rgba(201,121,98,.45)}.footer-spark{width:10px;height:10px;color:var(--terracotta);flex:none}.footer-meta{display:grid;grid-template-columns:1fr 1fr 1fr;align-items:center}.footer-page{text-align:center;font-family:Arial,Helvetica,sans-serif;font-style:normal;text-transform:uppercase;letter-spacing:.18em;font-size:6.8px}.footer-date{text-align:right}
.hero-heading{font-size:50px;line-height:1.01;margin:0 0 9px}.hero-subhead{font-family:Georgia,'Times New Roman',serif;font-size:12.6px;line-height:1.52;max-width:130mm;margin-bottom:9mm}.score-legend{display:flex;gap:7px;align-items:center;margin-bottom:7mm;text-transform:uppercase;letter-spacing:.13em;font-size:6.9px;font-weight:700}.score-legend span{display:flex;align-items:center;gap:5px;padding-right:10px;border-right:1px solid #D7D1CD}.score-legend span:last-child{border-right:0}.legend-dot,.status-dot{display:inline-block;width:7px;height:7px;border-radius:50%}.legend-dot.excellent,.score-card.excellent .status-dot{background:#0D6A4A}.legend-dot.strong,.score-card.strong .status-dot{background:#2C8264}.legend-dot.foundation,.score-card.foundation .status-dot{background:var(--blue)}.legend-dot.opportunity,.score-card.opportunity .status-dot{background:var(--gold)}.legend-dot.priority,.score-card.priority .status-dot{background:#8F6A3B}
.score-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:3.2mm}.score-card{height:56mm;border:1px solid #DDD6CF;border-radius:3mm;padding:5mm 3mm 4mm;text-align:center;background:rgba(255,255,255,.4)}.score-card.excellent,.score-card.strong{border-color:#C7D8CF}.score-card.foundation{border-color:#CBD5E2}.score-card.opportunity,.score-card.priority{border-color:#DFCBAA}.score-orbit{height:29mm;position:relative;display:flex;align-items:center;justify-content:center}.score-orbit .score-gauge{inset:0;left:50%;top:50%;width:29mm;height:29mm;transform:translate(-50%,-50%)}.score-orbit .gauge-track{display:none}.score-orbit .gauge-progress{stroke-width:1.3;stroke-dasharray:.1 3.35;stroke-linecap:round;opacity:.98}.score-orbit .gauge-companion-spark{fill:currentColor;opacity:.92}.score-number{font-family:Georgia,'Times New Roman',serif;font-size:40px;line-height:1;font-weight:400;position:relative;z-index:2}.score-card.excellent,.score-card.strong{color:#0D6A4A}.score-card.foundation{color:#5E789C}.score-card.opportunity,.score-card.priority{color:#B38338}.score-card-label{color:var(--navy);text-transform:uppercase;letter-spacing:.12em;font-size:7.4px;font-weight:700;min-height:10mm;display:flex;align-items:center;justify-content:center}.score-status{color:var(--navy);text-transform:uppercase;letter-spacing:.08em;font-size:6.8px;display:flex;align-items:center;justify-content:center;gap:4px;white-space:nowrap}
.focus-panel{margin-top:7mm;min-height:65mm;padding:7mm;display:grid;grid-template-columns:40mm 1fr 23mm;gap:7mm;align-items:center;position:relative}.focus-panel>*:not(.notched-frame){position:relative;z-index:1}.focus-frame path{fill:#EEF3EE;stroke:#BCCDBF}.focus-title{font-family:Georgia,'Times New Roman',serif;text-transform:uppercase;letter-spacing:.12em;text-align:center;font-size:11.2px;line-height:1.45;border-right:1px solid #CFC9C3;padding-right:7mm}.focus-panel ol{list-style:none;margin:0;padding:0}.focus-panel li{display:grid;grid-template-columns:8mm 1fr;gap:3mm;margin:0 0 5mm}.focus-panel li:last-child{margin-bottom:0}.priority-num{width:7mm;height:7mm;border-radius:50%;display:flex;align-items:center;justify-content:center;background:var(--terracotta);color:#fff;font-size:7px;font-weight:700}.focus-panel strong{font-family:Georgia,'Times New Roman',serif;font-size:11.4px;font-weight:600}.focus-stars{position:relative;height:40mm;overflow:visible}.decorative-arc{position:absolute;fill:none;overflow:visible}.decorative-arc path{fill:none;stroke:currentColor;stroke-width:1.4;stroke-linecap:round;stroke-dasharray:.1 5.5;vector-effect:non-scaling-stroke}.focus-arc{width:34mm;height:34mm;right:-6mm;bottom:-6mm;color:rgba(201,121,98,.82)}.focus-star{position:absolute;color:var(--terracotta)}.focus-star-one{width:30px;height:30px;right:2mm;top:4mm}.focus-star-two{width:12px;height:12px;right:-1mm;bottom:8mm;color:var(--navy)}.focus-star-three{width:10px;height:10px;left:0;bottom:4mm}.support-strip{display:grid;grid-template-columns:16mm 1fr;gap:5mm;align-items:center;margin-top:6mm}.support-icon{width:12mm;height:12mm;border:1px solid rgba(201,121,98,.55);border-radius:50%;position:relative;display:flex;align-items:center;justify-content:center}.support-spark{width:12px;height:12px;color:var(--terracotta)}.support-strip p{font-family:Georgia,'Times New Roman',serif;font-size:10.5px;line-height:1.55;margin:0}
.roadmap-page .topbar.compact{margin-bottom:6mm}.roadmap-page .page-kicker{min-height:auto;padding:5px 10px;font-size:7.2px}.roadmap-page .hero-heading{font-size:45px;margin-bottom:5px}.roadmap-page .hero-subhead{margin-bottom:3mm}.roadmap-list{margin-top:2mm}.roadmap-item{display:grid;grid-template-columns:29mm 1fr 15mm;gap:5mm;min-height:47mm;border-bottom:1px solid rgba(201,121,98,.35);padding:2mm 0 3mm;margin-bottom:2mm}.roadmap-number{font-family:Georgia,'Times New Roman',serif;color:var(--terracotta);font-size:43px;line-height:1;border-right:1px solid rgba(201,121,98,.55);padding-right:4mm}.roadmap-top{display:flex;align-items:center;gap:7px}.roadmap-status{border:1px solid currentColor;border-radius:999px;padding:4px 9px;text-transform:uppercase;letter-spacing:.14em;font-size:7px;font-weight:700;display:flex;align-items:center;gap:5px}.status-spark{width:6px;height:6px;color:currentColor;flex:none}.status-impact,.status-strong{color:var(--emerald)}.status-improve{color:var(--gold)}.roadmap-category{margin-left:auto;color:#6E7787;text-transform:uppercase;letter-spacing:.1em;font-size:6.8px}.roadmap-content h3{font-family:Georgia,'Times New Roman',serif;font-size:17px;line-height:1.2;font-weight:400;margin:2.5mm 0}.roadmap-columns{display:grid;grid-template-columns:1fr 1fr;gap:6mm}.roadmap-columns>div+div{border-left:1px solid rgba(201,121,98,.35);padding-left:6mm}.roadmap-label{text-transform:uppercase;letter-spacing:.1em;color:var(--emerald);font-size:7.7px;font-weight:700}.status-improve~.roadmap-category{} .roadmap-columns p{font-family:Georgia,'Times New Roman',serif;font-size:10.2px;line-height:1.45;margin:1.5mm 0 0}.roadmap-meta{margin-top:2mm;color:#6E7787;font-size:7.5px;display:flex;gap:8px}.roadmap-meta span:last-child{margin-left:auto}.roadmap-flourish{position:relative;overflow:visible}.roadmap-arc{width:30mm;height:30mm;right:-7mm;top:5mm;color:rgba(201,121,98,.82)}.roadmap-star{position:absolute;color:var(--terracotta)}.roadmap-star-one{width:25px;height:25px;right:0;top:12mm}.roadmap-star-two{width:11px;height:11px;right:5mm;top:31mm;color:var(--emerald)}.roadmap-star-three{width:9px;height:9px;right:-1mm;top:36mm;color:var(--navy)}.takeaway-box{margin-top:auto;min-height:30mm;padding:5mm 8mm;display:grid;grid-template-columns:18mm 1fr 21mm;gap:6mm;align-items:center;position:relative}.takeaway-box>*:not(.notched-frame){position:relative;z-index:1}.takeaway-frame path{fill:rgba(255,255,255,.22);stroke:rgba(201,121,98,.58)}.takeaway-left{display:flex;align-items:center;justify-content:center}.takeaway-spark{width:13mm;height:13mm;color:var(--terracotta)}.takeaway-spark.emerald{color:var(--emerald)}.takeaway-copy strong{text-transform:uppercase;letter-spacing:.16em;font-size:8.7px}.takeaway-rule{display:flex;align-items:center;gap:6px;width:52mm;margin:1.5mm 0}.takeaway-rule span{height:1px;flex:1;background:rgba(201,121,98,.48)}.takeaway-rule-spark{width:7px;height:7px;color:var(--terracotta);flex:none}.takeaway-box p{font-family:Georgia,'Times New Roman',serif;margin:1.5mm 0 0;font-size:10px;line-height:1.48}.takeaway-stars{position:relative;height:20mm}.takeaway-star{position:absolute}.takeaway-star-one{width:13px;height:13px;right:1mm;top:1mm;color:var(--emerald)}.takeaway-star-two{width:9px;height:9px;right:5mm;bottom:1mm;color:var(--terracotta)}.takeaway-star-three{width:8px;height:8px;right:-1mm;bottom:5mm;color:var(--navy)}
.rewrite-page .hero-heading{font-size:49px;max-width:127mm;line-height:1.02}.rewrite-page .hero-subhead{max-width:125mm;margin-bottom:5mm}.rewrite-layout{display:grid;grid-template-columns:1fr 61mm;gap:8mm;margin-top:4mm}.rewrite-main{min-width:0}.rewrite-item{display:grid;grid-template-columns:10mm 1fr;gap:4mm;padding:0 0 4mm;margin-bottom:4mm;border-bottom:1px solid rgba(201,121,98,.38)}.rewrite-num{width:9mm;height:9mm;min-width:9mm;min-height:9mm;max-width:9mm;max-height:9mm;display:block;align-self:start;overflow:visible}.rewrite-num circle{fill:none;stroke:rgba(201,121,98,.78);stroke-width:1.2}.rewrite-num text{fill:var(--terracotta);font-family:Georgia,'Times New Roman',serif;font-size:14px}.rewrite-title{text-transform:uppercase;letter-spacing:.14em;font-size:7.7px;font-weight:700}.rewrite-item blockquote{margin:2.5mm 0 2mm;border:1px solid #D9CBC4;border-radius:2.5mm;padding:3mm 5mm;font-family:Georgia,'Times New Roman',serif;font-size:12.8px;line-height:1.4;background:rgba(255,255,255,.35);position:relative}.rewrite-item blockquote:before{content:'“';color:var(--terracotta);font-size:20px;position:absolute;left:2mm;top:-1mm}.rewrite-item blockquote:after{content:'”';color:var(--terracotta);font-size:20px;position:absolute;right:2mm;bottom:-5mm}.rewrite-item p{font-family:Georgia,'Times New Roman',serif;font-size:10.2px;margin:0 0 0 3mm}.rewrite-item p b{color:var(--terracotta)}.rewrite-sidebar{display:flex;flex-direction:column;gap:5mm}.use-box,.working-box{padding:6mm 5mm;position:relative}.use-box>*:not(.notched-frame),.working-box>*:not(.notched-frame){position:relative;z-index:1}.use-frame path{fill:#FBF0EA;stroke:rgba(201,121,98,.58)}.working-frame path{fill:#EEF3EE;stroke:#AFC6B6}.side-heading-rule{display:flex;align-items:center;gap:6px;margin:-2mm auto 5mm;width:32mm}.side-heading-rule span{height:1px;flex:1;background:rgba(201,121,98,.46)}.side-heading-spark{width:10px;height:10px;color:var(--terracotta);flex:none}.side-heading-spark.emerald{color:var(--emerald)}.working-box .side-heading-rule span{background:rgba(31,90,75,.35)}.rewrite-sidebar h4{font-size:9.4px;line-height:1.35;text-align:center;text-transform:uppercase;letter-spacing:.16em;font-weight:500;margin:0 0 6mm;color:var(--terracotta)}.working-box h4{color:var(--emerald)}.rewrite-sidebar ul{list-style:none;margin:0;padding:0}.rewrite-sidebar li{font-family:Georgia,'Times New Roman',serif;font-size:9.8px;line-height:1.5;margin:0 0 5mm;padding-left:7mm;position:relative}.use-box li:before{display:none}.use-icon{position:absolute;left:0;top:-.6mm;width:5mm;height:5mm;fill:none;stroke:var(--terracotta);stroke-width:1.4;stroke-linecap:round;stroke-linejoin:round}.use-icon-ring{fill:none;stroke:rgba(201,121,98,.72);stroke-width:1.2}.use-icon-sparkle path{fill:var(--terracotta);stroke:none}.working-box li{padding-left:7mm}.use-box>.sidebar-stars,.working-box>.sidebar-stars{position:absolute;right:2mm;bottom:2mm;width:11mm;height:11mm;z-index:2}.sidebar-star{position:absolute;color:var(--terracotta)}.sidebar-star-large{width:9mm;height:9mm;right:0;bottom:0}.sidebar-star-small{width:4mm;height:4mm;left:0;top:0;color:var(--navy)}.working-stars .sidebar-star-large{color:var(--emerald)}.working-stars .sidebar-star-small{color:var(--emerald)}.checkmark{position:absolute;left:0;top:0;width:4.5mm;height:4.5mm;background:var(--emerald);color:white;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:6px}.rewrite-page-label{margin-top:auto;text-align:right;color:#6E7787;text-transform:uppercase;letter-spacing:.12em;font-size:6.5px}
.competitor-summary{font-family:Georgia,'Times New Roman',serif;font-size:11.8px;line-height:1.55;padding:6mm;border-left:3px solid var(--terracotta);background:#FFFDFC;margin:4mm 0 8mm}.competitor-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:5mm}.competitor-card{min-height:112mm;border:1px solid #DDD7D1;padding:6mm;background:rgba(255,255,255,.38)}.competitor-card.wins{background:var(--sage);border-color:#C8D7CB}.competitor-card.gaps{background:var(--blue-soft);border-color:#CAD5E2}.competitor-card.opportunities{background:var(--gold-soft);border-color:#E4D1B3}.competitor-label{text-transform:uppercase;letter-spacing:.14em;font-size:7.7px;font-weight:700}.wins .competitor-label{color:var(--emerald)}.gaps .competitor-label{color:#5E789C}.opportunities .competitor-label{color:var(--gold)}.competitor-card ul{padding-left:5mm;margin:6mm 0 0}.competitor-card li{font-family:Georgia,'Times New Roman',serif;font-size:10.5px;line-height:1.5;margin-bottom:5mm}.competitor-takeaway{margin-top:10mm}.competitor-takeaway strong{text-transform:uppercase;letter-spacing:.14em;font-size:7.5px}
.technical-card{border:1px solid #DDD7D1;background:rgba(255,255,255,.45);padding:6mm;margin-top:6mm}.technical-card h3{font-family:Georgia,'Times New Roman',serif;font-size:17px;font-weight:400;margin:0 0 5mm}.technical-card table{width:100%;border-collapse:collapse;font-size:9.6px}.technical-card th{text-transform:uppercase;letter-spacing:.1em;color:#6E7787;font-size:7.2px;text-align:left;border-bottom:1px solid #DDD7D1;padding:2.5mm}.technical-card td{padding:3mm 2.5mm;border-bottom:1px solid #EEE8E3}.signal-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:4mm;margin-top:7mm}.signal-grid>div{border:1px solid #DDD7D1;padding:6mm 4mm;background:rgba(255,255,255,.35)}.signal-grid strong{display:block;font-family:Georgia,'Times New Roman',serif;font-size:17px;font-weight:400;color:var(--emerald)}.signal-grid span{display:block;text-transform:uppercase;letter-spacing:.1em;font-size:7px;color:#6E7787;margin-top:2mm}.method-note{margin-top:9mm;background:var(--sage);border:1px solid #CEDACF;padding:6mm;display:grid;grid-template-columns:13mm 1fr;gap:5mm;align-items:center}.method-note strong{text-transform:uppercase;letter-spacing:.12em;font-size:7.7px;color:var(--emerald)}.method-note p{font-family:Georgia,'Times New Roman',serif;margin:2mm 0 0;font-size:10px}.disclaimer{margin-top:auto;font-size:7.5px;color:#7C8492;line-height:1.45;padding-top:5mm}
</style></head><body>${pages.join('')}</body></html>`;
}
