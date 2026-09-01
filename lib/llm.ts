import { env } from './env';
import { auditJsonSchema } from './analysis-schema';
import type { AuditAnalysis, AuditTier, PageSpeedSummary, SiteScrape } from './types';

export async function analyzeAudit(input: {
  tier: AuditTier;
  site: SiteScrape;
  pageSpeed: PageSpeedSummary[];
  competitors?: Array<{ url: string; site: SiteScrape; pageSpeed: PageSpeedSummary[] }>;
}): Promise<AuditAnalysis> {
  const prompt = `You are a senior technical SEO, ecommerce UX, accessibility, and AI-search optimization auditor.
Produce practical advice for a small business owner. Be specific, evidence-based, concise, and non-alarmist.
Do not invent measurements. Scores must reflect the supplied evidence. GEO means discoverability/clarity for answer engines and AI crawlers, based on crawl access, structured data, semantic headings, concise factual copy, lists, and llms.txt/robots signals.
Tier: ${input.tier}.
For quick_win, prioritize the homepage and exactly the highest-value fixes. For full_site, compare patterns across pages and include useful copy rewrites. For competitor_conquest, include a meaningful competitorGap based only on supplied competitor evidence.

AUDIT DATA:
${JSON.stringify(input).slice(0, 180000)}`;

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env.GEMINI_MODEL)}:generateContent`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseJsonSchema: auditJsonSchema,
        temperature: 0.25,
      },
    }),
    signal: AbortSignal.timeout(180000),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 800)}`);
  const json = await res.json();
  const text = json?.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? '').join('') ?? '';
  if (!text) throw new Error('Gemini returned no analysis text');
  const parsed = JSON.parse(text) as AuditAnalysis;
  if (!Number.isInteger(parsed.overallScore) || !Array.isArray(parsed.actionItems)) throw new Error('Gemini returned an invalid audit structure');
  return parsed;
}
