import { after } from 'next/server';
import { env } from './env';

export type AuditDispatchMode = 'netlify-background' | 'local-after';

function isNetlifyRuntime() {
  return process.env.NETLIFY === 'true' || Boolean(process.env.SITE_ID && process.env.URL);
}

function backgroundFunctionUrl(requestUrl: string) {
  const origin = new URL(requestUrl).origin;
  return `${origin}/.netlify/functions/process-audit-background`;
}

async function invokeBackgroundAudit(auditId: string, requestUrl: string) {
  const endpoint = backgroundFunctionUrl(requestUrl);
  let lastError: unknown;

  for (let attempt = 1; attempt <= 2; attempt++) {
    const startedAt = Date.now();
    console.info(`[audit ${auditId}] [dispatch] invoking Netlify background worker; attempt=${attempt}: ${endpoint}`);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${env.CRON_SECRET}`,
        },
        body: JSON.stringify({ auditId }),
        signal: AbortSignal.timeout(15_000),
      });

      // Background Functions acknowledge accepted asynchronous invocations with 202.
      if (response.status !== 202 && !response.ok) {
        const detail = (await response.text().catch(() => '')).slice(0, 800);
        throw new Error(`Background worker invocation failed (${response.status})${detail ? `: ${detail}` : ''}`);
      }

      console.info(`[audit ${auditId}] [dispatch] background worker accepted in ${Date.now() - startedAt}ms; attempt=${attempt}, status=${response.status}`);
      return;
    } catch (error) {
      lastError = error;
      console.warn(`[audit ${auditId}] [dispatch] background invocation attempt ${attempt} failed after ${Date.now() - startedAt}ms`, error);
      if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 750));
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError || 'Background worker invocation failed'));
}

/**
 * Production Netlify requests are dispatched to a true Background Function.
 * Plain `next dev` keeps the previous `after()` behavior so local development
 * does not require Netlify CLI just to run an audit.
 */
export async function dispatchAudit(auditId: string, requestUrl: string): Promise<AuditDispatchMode> {
  if (isNetlifyRuntime()) {
    await invokeBackgroundAudit(auditId, requestUrl);
    return 'netlify-background';
  }

  console.info(`[audit ${auditId}] [dispatch] non-Netlify runtime detected; using Next.js after() for local development`);
  after(async () => {
    try {
      const { processAudit } = await import('./pipeline');
      await processAudit(auditId);
    } catch (error) {
      console.error(`[audit ${auditId}] local pipeline failed`, error);
    }
  });
  return 'local-after';
}
