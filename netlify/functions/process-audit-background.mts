import { env } from '../../lib/env';
import { processAudit } from '../../lib/pipeline';

/**
 * Netlify Background Function entrypoint.
 *
 * v4.25: this entrypoint intentionally uses .mts so Netlify executes and bundles
 * it as an ES module. @sparticuz/chromium 149 is ESM-only, so a CommonJS
 * function would turn its import into require() and fail during Lambda init.
 *
 * Background mode is declared explicitly and is also reinforced by the legacy
 * -background filename suffix.
 */
export const config = {
  background: true,
};

export default async function processAuditBackground(request: Request) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    console.error('[background audit] rejected unauthorized invocation');
    return;
  }

  let auditId = '';
  try {
    const payload = (await request.json()) as { auditId?: unknown };
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
  console.info(`[audit ${auditId}] [background] worker started; module=esm`);
  try {
    await processAudit(auditId);
    console.info(`[audit ${auditId}] [background] worker finished in ${Date.now() - startedAt}ms`);
  } catch (error) {
    console.error(`[audit ${auditId}] [background] worker failed after ${Date.now() - startedAt}ms`, error);
    // Re-throw so Netlify can apply its Background Function retry behavior.
    throw error;
  }
}
