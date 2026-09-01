import { env } from './env';
import { auditJsonSchema } from './analysis-schema';
import type { AuditAnalysis, AuditTier, PageSpeedSummary, SiteScrape } from './types';

type AuditInput = {
  tier: AuditTier;
  site: SiteScrape;
  pageSpeed: PageSpeedSummary[];
  competitors?: Array<{ url: string; site: SiteScrape; pageSpeed: PageSpeedSummary[] }>;
  customerContext?: unknown;
};

type Provider = 'openai' | 'gemini';

const RETRY_DELAYS_MS = [1500, 4000];

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function instructionsFor(tier: AuditTier) {
  return `You are a senior technical SEO, ecommerce UX, accessibility, and AI-search optimization auditor.
Produce practical advice for a small business owner. Be specific, evidence-based, concise, and non-alarmist.
Do not invent measurements. Scores must reflect the supplied evidence. GEO means discoverability/clarity for answer engines and AI crawlers, based on crawl access, structured data, semantic headings, concise factual copy, lists, and llms.txt/robots signals.
Tier: ${tier}.
For quick_win, prioritize the homepage and exactly the highest-value fixes. For full_site, compare patterns across pages, include useful copy rewrites, fill pageInsights for up to 5 reviewed pages with evidence-based page scores/roles/strengths/opportunities, and fill crossPageInsights with up to 4 meaningful patterns that genuinely span multiple pages. If site.utilityFindings is present, treat those URLs only as technical evidence: they may inform action items or technical notes, but they are NOT part of the purchased reviewed-page set and must not receive a pageInsight or replace a meaningful client-facing page. For full_site, keep pageInsight role under 20 words, strength/opportunity under 35 words each, and each crossPageInsight finding under 50 words with why under 30 words so the client PDF remains readable and uncluttered. For competitor_conquest, create a premium strategic market analysis based only on supplied competitor evidence: fill competitorGap and competitorIntelligence completely. competitorIntelligence should compare the client against each supplied competitor, use 4-6 score dimensions, create competitor profiles, identify where the client leads and where competitors lead, analyze messaging/positioning gaps, identify SEO/content opportunities and market white space, recommend 4-6 differentiated win strategies, create a practical three-phase 90-day advantage plan, and explicitly distinguish smart actions from competitor tactics the client should not chase or copy. WRITE TO FIT THE REPORT: do not return sprawling prose that will need visible truncation. Keep executiveSummary to 80 words max; biggestAdvantage and biggestOpportunity to 24 words each; lead/competitor-lead details to 32 words; competitor profile positioning to 18 words and each profile bullet/item to 24 words; messaging-gap opportunity to 22 words; SEO rationale to 30 words and each action to 20 words; white-space finding to 34 words and opportunity to 26 words; win-strategy description to 34 words; each 90-day action to 22 words; Do This / Don't Chase items to 26 words. Prefer complete, concise sentences over cut-off phrases or ellipses. Never invent competitor claims, rankings, traffic, backlinks, revenue, market share, or metrics that are not present in the evidence. Scores are judgmental audit scores derived from supplied site evidence, not claims about actual market share or business performance.
Never expose internal tier identifiers or product nicknames such as quick_win, Quick Win, Full Site, or Competitor Conquest in client-facing fields. reportTitle should be polished, neutral, and focused on the client's website rather than the purchased tier.
Make executiveSummary specific to the supplied evidence and this particular website. Avoid generic filler such as simply saying the site has a solid foundation or clear opportunities; name the most meaningful strength, weakness, or pattern when the evidence supports it, and do not merely restate the overall score.
If customerContext contains a stated platform or business goal, use it only to prioritize otherwise evidence-supported recommendations; do not invent facts from it.`;
}

function auditData(input: AuditInput) {
  return `AUDIT DATA:\n${JSON.stringify(input).slice(0, 180000)}`;
}

function validateAnalysis(value: unknown, provider: string): AuditAnalysis {
  const parsed = value as AuditAnalysis;
  if (!parsed || typeof parsed !== 'object') throw new Error(`${provider} returned no audit object`);
  if (!Number.isInteger(parsed.overallScore) || parsed.overallScore < 0 || parsed.overallScore > 100) {
    throw new Error(`${provider} returned an invalid overallScore`);
  }
  if (!Array.isArray(parsed.actionItems) || !Array.isArray(parsed.quickWins) || !Array.isArray(parsed.rewrites)) {
    throw new Error(`${provider} returned an invalid audit structure`);
  }
  return parsed;
}

function openAiModelForTier(tier: AuditTier) {
  if (tier === 'quick_win') return env.OPENAI_QUICK_WIN_MODEL;
  if (tier === 'competitor_conquest') return env.OPENAI_COMPETITOR_MODEL;
  return env.OPENAI_FULL_SITE_MODEL;
}

async function callOpenAI(input: AuditInput): Promise<AuditAnalysis> {
  if (!env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not configured');

  const model = openAiModelForTier(input.tier);
  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      instructions: instructionsFor(input.tier),
      input: auditData(input),
      reasoning: { effort: input.tier === 'quick_win' ? 'low' : 'medium' },
      text: {
        format: {
          type: 'json_schema',
          name: 'website_audit',
          // The shared schema intentionally has a couple of optional fields for
          // Gemini compatibility, so keep strict off and validate after parsing.
          strict: false,
          schema: auditJsonSchema,
        },
      },
      max_output_tokens: 16000,
      store: false,
    }),
    signal: AbortSignal.timeout(180000),
  });

  if (!res.ok) {
    const body = (await res.text()).slice(0, 1200);
    const error = new Error(`OpenAI ${res.status}: ${body}`) as Error & { status?: number };
    error.status = res.status;
    throw error;
  }

  const json = await res.json();
  if (json?.status === 'failed') {
    throw new Error(`OpenAI response failed: ${JSON.stringify(json?.error ?? {}).slice(0, 800)}`);
  }

  const text = (json?.output ?? [])
    .flatMap((item: any) => item?.content ?? [])
    .filter((part: any) => part?.type === 'output_text')
    .map((part: any) => part?.text ?? '')
    .join('');

  if (!text) throw new Error(`OpenAI ${model} returned no analysis text`);
  return validateAnalysis(JSON.parse(text), `OpenAI ${model}`);
}

async function callGemini(input: AuditInput): Promise<AuditAnalysis> {
  if (!env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not configured');

  const prompt = `${instructionsFor(input.tier)}\n\n${auditData(input)}`;
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

  if (!res.ok) {
    const body = (await res.text()).slice(0, 1200);
    const error = new Error(`Gemini ${res.status}: ${body}`) as Error & { status?: number };
    error.status = res.status;
    throw error;
  }

  const json = await res.json();
  const text = json?.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? '').join('') ?? '';
  if (!text) throw new Error('Gemini returned no analysis text');
  return validateAnalysis(JSON.parse(text), `Gemini ${env.GEMINI_MODEL}`);
}

function isTransient(error: unknown) {
  const status = (error as { status?: number } | null)?.status;
  if (status === 408 || status === 409 || status === 429 || (status && status >= 500)) return true;
  const message = error instanceof Error ? error.message : String(error);
  return /timeout|timed out|ECONNRESET|fetch failed|network/i.test(message);
}

async function withTransientRetries<T>(label: string, fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isTransient(error) || attempt === RETRY_DELAYS_MS.length) break;
      console.warn(`${label} transient failure; retrying attempt ${attempt + 2}`, error);
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }
  throw lastError;
}

async function runProvider(provider: Provider, input: AuditInput) {
  if (provider === 'openai') return withTransientRetries('OpenAI', () => callOpenAI(input));
  return withTransientRetries('Gemini', () => callGemini(input));
}

export async function analyzeAudit(input: AuditInput): Promise<AuditAnalysis> {
  const primary = env.AI_PRIMARY_PROVIDER;
  const fallback: Provider = primary === 'openai' ? 'gemini' : 'openai';

  try {
    return await runProvider(primary, input);
  } catch (primaryError) {
    const fallbackConfigured = fallback === 'openai' ? Boolean(env.OPENAI_API_KEY) : Boolean(env.GEMINI_API_KEY);
    if (!fallbackConfigured) throw primaryError;

    console.error(`${primary} audit analysis failed; trying ${fallback}`, primaryError);
    try {
      return await runProvider(fallback, input);
    } catch (fallbackError) {
      const primaryMessage = primaryError instanceof Error ? primaryError.message : String(primaryError);
      const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
      throw new Error(`All AI providers failed. Primary (${primary}): ${primaryMessage}. Fallback (${fallback}): ${fallbackMessage}`);
    }
  }
}
