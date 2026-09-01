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

// Background execution gives the model room to finish, but each provider call still
// has a hard ceiling so a degraded upstream cannot consume the full 15-minute worker.
const PROVIDER_REQUEST_TIMEOUT_MS = 120_000;
const RETRY_DELAYS_MS = [2000];

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function logPrefix(auditId: string | undefined, provider?: string) {
  return `${auditId ? `[audit ${auditId}] ` : ''}[llm${provider ? `:${provider}` : ''}]`;
}

function instructionsFor(tier: AuditTier) {
  return `You are a senior technical SEO, ecommerce UX, accessibility, and AI-search optimization auditor.
Produce practical advice for a small business owner. Be specific, evidence-based, concise, and non-alarmist.
VOICE AND POINT OF VIEW: Use a deliberate two-part editorial voice across every tier. Describe the website, business, competitors, observed behavior, measurements, strengths, weaknesses, and evidence objectively in third person (or neutral factual language). When interpreting what the evidence means for the client, identifying priorities, opportunities, recommendations, roadmap actions, or next steps, address the client directly using second person (you/your). In short: describe the site objectively; advise the client directly. Do not switch point of view randomly within the same field. Avoid impersonal recommendation phrasing such as 'the business should' or '[Company] should' when the field is advisory; prefer 'Your next step is...', 'You can...', 'Your strongest opportunity is...', or an imperative action. Competitor descriptions always remain third person. Do not overuse 'you' in factual findings or force second person into technical measurements.
VOICE FIELD CONTRACT (apply identically across all tiers): executive summaries, observed strengths, measurements, page roles, factual findings, competitor profiles, market patterns, and evidence statements are objective/third-person or neutral. Opportunities, quick wins, action-item titles, recommended next steps, roadmap items, strategy actions, 'Do This'/'Don't Chase' guidance, and page-level competitive opportunities address the client directly with you/your or an implied-you imperative. In mixed sections, keep the evidence sentence objective, then make the recommendation sentence direct. Ready-to-use copy is written for the client's end customer and should not be forced into this analyst/client point-of-view rule.
Do not invent measurements. Scores must reflect the supplied evidence. GEO means discoverability/clarity for answer engines and AI crawlers, based on crawl access, structured data, semantic headings, concise factual copy, lists, and llms.txt/robots signals.
Tier: ${tier}.
For quick_win, prioritize the homepage and exactly the highest-value fixes. For full_site, compare patterns across pages, include useful copy rewrites, fill pageInsights for up to 5 reviewed pages with evidence-based page scores/roles/strengths/opportunities, and fill crossPageInsights with up to 4 meaningful patterns that genuinely span multiple pages. If site.utilityFindings is present, treat those URLs only as technical evidence: they may inform action items or technical notes, but they are NOT part of the purchased reviewed-page set and must not receive a pageInsight or replace a meaningful client-facing page. For full_site, keep pageInsight role under 20 words, strength/opportunity under 35 words each, and each crossPageInsight finding under 50 words with why under 30 words so the client PDF remains readable and uncluttered. For competitor_conquest, create a premium strategic market analysis based only on supplied competitor evidence: fill competitorGap and competitorIntelligence completely. competitorIntelligence should compare the client against each supplied competitor, use 4-6 score dimensions, create competitor profiles, identify where the client leads and where competitors lead, analyze messaging/positioning gaps, identify SEO/content opportunities and market white space, recommend 4-6 differentiated win strategies, create a practical three-phase 90-day advantage plan, and explicitly distinguish smart actions from competitor tactics the client should not chase or copy. WRITE TO FIT THE REPORT: do not return sprawling prose that will need visible truncation. Keep executiveSummary to 80 words max; biggestAdvantage and biggestOpportunity to 24 words each; lead/competitor-lead details to 32 words; competitor profile positioning to 16 words and each profile bullet/item to 20 words; messaging-gap opportunity to 18 words; SEO rationale to 25 words and each action to 17 words; white-space finding to 28 words and opportunity to 22 words; win-strategy description to 30 words; each 90-day action to 19 words; Do This / Don't Chase items to 26 words. Prefer complete, concise sentences over cut-off phrases or ellipses. Never invent competitor claims, rankings, traffic, backlinks, revenue, market share, or metrics that are not present in the evidence. Scores are judgmental audit scores derived from supplied site evidence, not claims about actual market share or business performance.
Never expose internal tier identifiers or product nicknames such as quick_win, Quick Win, Full Site, or Competitor Conquest in client-facing fields. reportTitle should be polished, neutral, and focused on the client's website rather than the purchased tier.
Make executiveSummary specific to the supplied evidence and this particular website. Avoid generic filler such as simply saying the site has a solid foundation or clear opportunities; name the most meaningful strength, weakness, or pattern when the evidence supports it, and do not merely restate the overall score.
If customerContext contains a stated platform or business goal, use it only to prioritize otherwise evidence-supported recommendations; do not invent facts from it.`;
}

const textBudgets: Record<AuditTier, number> = {
  quick_win: 7000,
  full_site: 4500,
  competitor_conquest: 3500,
};

function compactRobotsTxt(value: string | null) {
  if (!value) return null;
  // Preserve crawler directives and sitemap signals instead of sending comments,
  // vendor boilerplate, or an entire unusually large robots.txt file to the model.
  const directives = value
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => /^(user-agent|allow|disallow|sitemap|crawl-delay|host|clean-param)\s*:/i.test(line))
    .slice(0, 100)
    .join('\n');
  return (directives || value).slice(0, 6000);
}

function compactPage(page: SiteScrape['pages'][number], tier: AuditTier, competitor = false) {
  const textLimit = competitor ? 3000 : textBudgets[tier];
  const internalSampleLimit = tier === 'quick_win' && !competitor ? 30 : 18;
  return {
    url: page.url,
    title: page.title,
    metaDescription: page.metaDescription,
    canonical: page.canonical,
    robotsMeta: page.robotsMeta,
    viewport: page.viewport,
    h1: page.h1.slice(0, 8),
    h2: page.h2.slice(0, 12),
    textSample: page.textSample.slice(0, textLimit),
    wordCount: page.wordCount,
    internalLinkCount: page.internalLinks.length,
    internalLinkSamples: page.internalLinks.slice(0, internalSampleLimit),
    externalLinkCount: page.externalLinks.length,
    externalLinkSamples: page.externalLinks.slice(0, 10),
    imageCount: page.imageCount,
    imagesMissingAlt: page.imagesMissingAlt,
    buttons: page.buttons.slice(0, 15),
    forms: page.forms,
    jsonLdTypes: page.jsonLdTypes.slice(0, 20),
    lang: page.lang,
  };
}

function compactUtilityPage(page: SiteScrape['pages'][number]) {
  return {
    url: page.url,
    title: page.title,
    metaDescription: page.metaDescription,
    canonical: page.canonical,
    robotsMeta: page.robotsMeta,
    h1: page.h1.slice(0, 4),
    textSample: page.textSample.slice(0, 1000),
    wordCount: page.wordCount,
    forms: page.forms,
    jsonLdTypes: page.jsonLdTypes.slice(0, 10),
  };
}

function compactSite(site: SiteScrape, tier: AuditTier, competitor = false) {
  return {
    startUrl: site.startUrl,
    pages: site.pages.map(page => compactPage(page, tier, competitor)),
    utilityFindings: (site.utilityFindings ?? []).slice(0, 8).map(compactUtilityPage),
    robotsTxt: compactRobotsTxt(site.robotsTxt),
    // llms.txt is itself intended as concise model-readable site context, so retain
    // a meaningful sample while guarding against accidental giant/generated files.
    llmsTxt: site.llmsTxt?.slice(0, competitor ? 4000 : 7000) ?? null,
    hasSitemap: site.hasSitemap,
  };
}

function compactPageSpeed(results: PageSpeedSummary[]) {
  return results.map(result => ({
    url: result.url,
    strategy: result.strategy,
    scores: result.scores,
    metrics: result.metrics,
    opportunities: result.opportunities.slice(0, 6),
  }));
}

function compactAuditInput(input: AuditInput) {
  return {
    tier: input.tier,
    site: compactSite(input.site, input.tier),
    pageSpeed: compactPageSpeed(input.pageSpeed),
    competitors: (input.competitors ?? []).slice(0, 3).map(competitor => ({
      url: competitor.url,
      site: compactSite(competitor.site, 'quick_win', true),
      pageSpeed: compactPageSpeed(competitor.pageSpeed),
    })),
    customerContext: input.customerContext,
  };
}

function auditData(input: AuditInput) {
  const rawChars = JSON.stringify(input).length;
  const compactJson = JSON.stringify(compactAuditInput(input));
  return {
    text: `AUDIT DATA:\n${compactJson}`,
    rawChars,
    compactChars: compactJson.length,
  };
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

async function callOpenAI(input: AuditInput, auditId?: string, attempt = 1): Promise<AuditAnalysis> {
  if (!env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not configured');

  const model = openAiModelForTier(input.tier);
  const prefix = logPrefix(auditId, 'openai');
  const requestStartedAt = Date.now();
  const instructions = instructionsFor(input.tier);
  const auditPayload = auditData(input);
  const data = auditPayload.text;
  const requestBody = JSON.stringify({
    model,
    instructions,
    input: data,
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
  });

  console.info(`${prefix} request started; attempt=${attempt}, tier=${input.tier}, model=${model}, rawAuditChars=${auditPayload.rawChars}, compactAuditChars=${auditPayload.compactChars}, auditDataChars=${data.length}, requestChars=${requestBody.length}`);

  try {
    const fetchStartedAt = Date.now();
    const res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: requestBody,
      signal: AbortSignal.timeout(PROVIDER_REQUEST_TIMEOUT_MS),
    });
    console.info(`${prefix} HTTP response received in ${Date.now() - fetchStartedAt}ms; attempt=${attempt}, status=${res.status}, model=${model}`);

    if (!res.ok) {
      const body = (await res.text()).slice(0, 1200);
      const error = new Error(`OpenAI ${res.status}: ${body}`) as Error & { status?: number };
      error.status = res.status;
      throw error;
    }

    const parseStartedAt = Date.now();
    const json = await res.json();
    console.info(`${prefix} response JSON parsed in ${Date.now() - parseStartedAt}ms; attempt=${attempt}, apiStatus=${json?.status ?? 'unknown'}, inputTokens=${json?.usage?.input_tokens ?? 'n/a'}, outputTokens=${json?.usage?.output_tokens ?? 'n/a'}, totalTokens=${json?.usage?.total_tokens ?? 'n/a'}`);

    if (json?.status === 'failed') {
      throw new Error(`OpenAI response failed: ${JSON.stringify(json?.error ?? {}).slice(0, 800)}`);
    }

    const text = (json?.output ?? [])
      .flatMap((item: any) => item?.content ?? [])
      .filter((part: any) => part?.type === 'output_text')
      .map((part: any) => part?.text ?? '')
      .join('');

    if (!text) throw new Error(`OpenAI ${model} returned no analysis text`);

    const validationStartedAt = Date.now();
    const analysis = validateAnalysis(JSON.parse(text), `OpenAI ${model}`);
    console.info(`${prefix} request complete in ${Date.now() - requestStartedAt}ms; attempt=${attempt}, model=${model}, outputChars=${text.length}, validation=${Date.now() - validationStartedAt}ms`);
    return analysis;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`${prefix} request FAILED after ${Date.now() - requestStartedAt}ms; attempt=${attempt}, model=${model}: ${message}`);
    throw error;
  }
}

async function callGemini(input: AuditInput, auditId?: string, attempt = 1): Promise<AuditAnalysis> {
  if (!env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not configured');

  const prefix = logPrefix(auditId, 'gemini');
  const requestStartedAt = Date.now();
  const auditPayload = auditData(input);
  const prompt = `${instructionsFor(input.tier)}\n\n${auditPayload.text}`;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env.GEMINI_MODEL)}:generateContent`;
  const requestBody = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseJsonSchema: auditJsonSchema,
      temperature: 0.25,
    },
  });

  console.info(`${prefix} request started; attempt=${attempt}, tier=${input.tier}, model=${env.GEMINI_MODEL}, rawAuditChars=${auditPayload.rawChars}, compactAuditChars=${auditPayload.compactChars}, promptChars=${prompt.length}, requestChars=${requestBody.length}`);

  try {
    const fetchStartedAt = Date.now();
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: requestBody,
      signal: AbortSignal.timeout(PROVIDER_REQUEST_TIMEOUT_MS),
    });
    console.info(`${prefix} HTTP response received in ${Date.now() - fetchStartedAt}ms; attempt=${attempt}, status=${res.status}, model=${env.GEMINI_MODEL}`);

    if (!res.ok) {
      const body = (await res.text()).slice(0, 1200);
      const error = new Error(`Gemini ${res.status}: ${body}`) as Error & { status?: number };
      error.status = res.status;
      throw error;
    }

    const parseStartedAt = Date.now();
    const json = await res.json();
    console.info(`${prefix} response JSON parsed in ${Date.now() - parseStartedAt}ms; attempt=${attempt}, promptTokens=${json?.usageMetadata?.promptTokenCount ?? 'n/a'}, outputTokens=${json?.usageMetadata?.candidatesTokenCount ?? 'n/a'}, totalTokens=${json?.usageMetadata?.totalTokenCount ?? 'n/a'}`);

    const text = json?.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? '').join('') ?? '';
    if (!text) throw new Error('Gemini returned no analysis text');

    const validationStartedAt = Date.now();
    const analysis = validateAnalysis(JSON.parse(text), `Gemini ${env.GEMINI_MODEL}`);
    console.info(`${prefix} request complete in ${Date.now() - requestStartedAt}ms; attempt=${attempt}, model=${env.GEMINI_MODEL}, outputChars=${text.length}, validation=${Date.now() - validationStartedAt}ms`);
    return analysis;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`${prefix} request FAILED after ${Date.now() - requestStartedAt}ms; attempt=${attempt}, model=${env.GEMINI_MODEL}: ${message}`);
    throw error;
  }
}

function isTransient(error: unknown) {
  const status = (error as { status?: number } | null)?.status;
  if (status === 408 || status === 409 || status === 429 || (status && status >= 500)) return true;
  const message = error instanceof Error ? error.message : String(error);
  return /timeout|timed out|ECONNRESET|fetch failed|network/i.test(message);
}

async function withTransientRetries<T>(
  label: string,
  auditId: string | undefined,
  fn: (attempt: number) => Promise<T>,
): Promise<T> {
  let lastError: unknown;
  const prefix = logPrefix(auditId, label.toLowerCase());

  for (let attemptIndex = 0; attemptIndex <= RETRY_DELAYS_MS.length; attemptIndex++) {
    const attempt = attemptIndex + 1;
    const attemptStartedAt = Date.now();
    try {
      const value = await fn(attempt);
      if (attempt > 1) {
        console.info(`${prefix} retry attempt ${attempt} succeeded in ${Date.now() - attemptStartedAt}ms`);
      }
      return value;
    } catch (error) {
      lastError = error;
      const transient = isTransient(error);
      const finalAttempt = attemptIndex === RETRY_DELAYS_MS.length;
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`${prefix} attempt ${attempt} failed after ${Date.now() - attemptStartedAt}ms; transient=${transient}, finalAttempt=${finalAttempt}: ${message}`);
      if (!transient || finalAttempt) break;

      const delay = RETRY_DELAYS_MS[attemptIndex];
      console.warn(`${prefix} waiting ${delay}ms before retry attempt ${attempt + 1}`);
      await sleep(delay);
    }
  }
  throw lastError;
}

async function runProvider(provider: Provider, input: AuditInput, auditId?: string) {
  if (provider === 'openai') return withTransientRetries('OpenAI', auditId, attempt => callOpenAI(input, auditId, attempt));
  return withTransientRetries('Gemini', auditId, attempt => callGemini(input, auditId, attempt));
}

export async function analyzeAudit(input: AuditInput, auditId?: string): Promise<AuditAnalysis> {
  const startedAt = Date.now();
  const prefix = logPrefix(auditId);
  const primary = env.AI_PRIMARY_PROVIDER;
  const fallback: Provider = primary === 'openai' ? 'gemini' : 'openai';

  console.info(`${prefix} analysis routing started; tier=${input.tier}, primary=${primary}, fallback=${fallback}, pages=${input.site.pages.length}, pagespeedResults=${input.pageSpeed.length}, competitors=${input.competitors?.length ?? 0}`);

  try {
    const analysis = await runProvider(primary, input, auditId);
    console.info(`${prefix} analysis routing complete in ${Date.now() - startedAt}ms; provider=${primary}`);
    return analysis;
  } catch (primaryError) {
    const fallbackConfigured = fallback === 'openai' ? Boolean(env.OPENAI_API_KEY) : Boolean(env.GEMINI_API_KEY);
    const primaryMessage = primaryError instanceof Error ? primaryError.message : String(primaryError);
    if (!fallbackConfigured) {
      console.error(`${prefix} primary provider ${primary} failed after ${Date.now() - startedAt}ms and fallback ${fallback} is not configured: ${primaryMessage}`);
      throw primaryError;
    }

    console.error(`${prefix} primary provider ${primary} failed after ${Date.now() - startedAt}ms; trying fallback ${fallback}: ${primaryMessage}`);
    const fallbackStartedAt = Date.now();
    try {
      const analysis = await runProvider(fallback, input, auditId);
      console.info(`${prefix} fallback ${fallback} succeeded in ${Date.now() - fallbackStartedAt}ms; totalAnalysis=${Date.now() - startedAt}ms`);
      return analysis;
    } catch (fallbackError) {
      const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
      console.error(`${prefix} fallback ${fallback} also failed after ${Date.now() - fallbackStartedAt}ms; totalAnalysis=${Date.now() - startedAt}ms: ${fallbackMessage}`);
      throw new Error(`All AI providers failed. Primary (${primary}): ${primaryMessage}. Fallback (${fallback}): ${fallbackMessage}`);
    }
  }
}
