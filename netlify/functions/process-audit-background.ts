import { env } from '../../lib/env';
import { processAudit } from '../../lib/pipeline';

/**
 * Netlify Background Function entrypoint.
 *
 * The `-background` filename is the documented background-function convention
 * and causes Netlify to return 202 immediately while this handler continues for
 * up to the background execution limit.
 */
export async function handler(event: { headers?: Record<string, string | undefined>; body?: string | null }) {
  const auth = event.headers?.authorization ?? event.headers?.Authorization;
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    console.error('[background audit] rejected unauthorized invocation');
    return;
  }

  let auditId = '';
  try {
    const payload = JSON.parse(event.body || '{}') as { auditId?: unknown };
    auditId = typeof payload.auditId === 'string' ? payload.auditId.trim() : '';
  } catch (error) {
    console.error('[background audit] invalid JSON body', error);
    return;
  }

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(auditId)) {
    console.error('[background audit] missing or invalid auditId');
    return;
  }

  const startedAt = Date.now();
  console.info(`[audit ${auditId}] [background] worker started`);
  try {
    await processAudit(auditId);
    console.info(`[audit ${auditId}] [background] worker finished in ${Date.now() - startedAt}ms`);
  } catch (error) {
    console.error(`[audit ${auditId}] [background] worker failed after ${Date.now() - startedAt}ms`, error);
    // Re-throw so Netlify can apply its Background Function retry behavior.
    throw error;
  }
}
