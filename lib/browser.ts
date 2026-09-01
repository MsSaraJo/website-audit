import fs from 'node:fs';
import chromiumBinary from '@sparticuz/chromium';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import { assertPublicUrl } from './url-security';
import { env } from './env';

async function executablePath() {
  if (env.CHROMIUM_EXECUTABLE_PATH) return env.CHROMIUM_EXECUTABLE_PATH;
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) return chromiumBinary.executablePath();
  const candidates = [
    '/usr/bin/google-chrome-stable', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  ];
  const found = candidates.find(p => fs.existsSync(p));
  if (!found) throw new Error('Chrome/Chromium not found. Set CHROMIUM_EXECUTABLE_PATH for local development.');
  return found;
}

export async function launchBrowser(): Promise<Browser> {
  const serverless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
  return puppeteer.launch({
    executablePath: await executablePath(),
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
