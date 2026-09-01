import fs from 'node:fs';
import type { Browser, Page } from 'puppeteer-core';
import { assertPublicUrl } from './url-security';
import { env } from './env';

/**
 * Load browser packages at runtime with Node's native dynamic import().
 *
 * Netlify may emit the surrounding function bundle as CommonJS even when the
 * function entrypoint is authored as ESM. @sparticuz/chromium 149 is ESM-only,
 * so any bundler-generated require('@sparticuz/chromium') fails during Lambda
 * initialization. Using Function here intentionally hides the module specifier
 * from esbuild and guarantees Node performs a real runtime import().
 *
 * The specifiers are hard-coded below; no user-controlled value reaches this
 * loader.
 */
const nativeImport = new Function(
  'specifier',
  'return import(specifier)'
) as (specifier: string) => Promise<Record<string, any>>;

let browserDepsPromise: Promise<{
  chromiumBinary: any;
  puppeteer: any;
}> | null = null;

async function getBrowserDeps() {
  if (!browserDepsPromise) {
    browserDepsPromise = (async () => {
      const startedAt = Date.now();
      console.info(`[browser] loading browser packages via native dynamic import; node=${process.version}`);
      try {
        const [chromiumModule, puppeteerModule] = await Promise.all([
          nativeImport('@sparticuz/chromium'),
          nativeImport('puppeteer-core'),
        ]);
        console.info(`[browser] browser packages loaded in ${Date.now() - startedAt}ms`);
        return {
          chromiumBinary: chromiumModule.default ?? chromiumModule,
          puppeteer: puppeteerModule.default ?? puppeteerModule,
        };
      } catch (error) {
        browserDepsPromise = null;
        console.error(`[browser] browser package import failed after ${Date.now() - startedAt}ms`, error);
        throw error;
      }
    })();
  }
  return browserDepsPromise;
}

async function executablePath(chromiumBinary: any) {
  if (env.CHROMIUM_EXECUTABLE_PATH) return env.CHROMIUM_EXECUTABLE_PATH;
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return chromiumBinary.executablePath();
  }
  const candidates = [
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  ];
  const found = candidates.find(p => fs.existsSync(p));
  if (!found) throw new Error('Chrome/Chromium not found. Set CHROMIUM_EXECUTABLE_PATH for local development.');
  return found;
}

export async function launchBrowser(): Promise<Browser> {
  const serverless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
  const { chromiumBinary, puppeteer } = await getBrowserDeps();

  return puppeteer.launch({
    executablePath: await executablePath(chromiumBinary),
    args: serverless ? chromiumBinary.args : ['--no-sandbox', '--disable-dev-shm-usage'],
    headless: serverless ? 'shell' : true,
  });
}

export async function hardenPage(page: Page) {
  const cache = new Map<string, boolean>();
  await page.setRequestInterception(true);
  page.on('request', async request => {
    const url = request.url();
    if (/^(data:|blob:|about:)/.test(url)) {
      await request.continue().catch(() => undefined);
      return;
    }
    try {
      const host = new URL(url).hostname;
      if (!cache.has(host)) {
        await assertPublicUrl(url);
        cache.set(host, true);
      }
      await request.continue().catch(() => undefined);
    } catch {
      await request.abort('blockedbyclient').catch(() => undefined);
    }
  });
}
