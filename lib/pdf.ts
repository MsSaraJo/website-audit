import { launchBrowser } from './browser';

export async function htmlToPdf(html: string): Promise<Buffer> {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    const bytes = await page.pdf({
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: '<div style="font-size:8px;width:100%;text-align:center;color:#94a3b8"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
      margin: { top: '16mm', right: '14mm', bottom: '18mm', left: '14mm' },
    });
    return Buffer.from(bytes);
  } finally { await browser.close(); }
}
