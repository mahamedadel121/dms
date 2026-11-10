import type { Browser } from 'playwright';
import { DomainError } from '../errors';

let browserP: Promise<Browser> | undefined;

async function launch(): Promise<Browser> {
  const { chromium } = await import('playwright');
  const channel = process.env.PDF_BROWSER_CHANNEL || undefined;
  const attempts: (string | undefined)[] = [channel];
  if (!channel) attempts.push('msedge', 'chrome');
  let last: unknown;
  for (const ch of attempts) {
    try {
      return await chromium.launch(ch ? { channel: ch } : {});
    } catch (e) {
      last = e;
    }
  }
  throw new DomainError('INVALID_STATE', `Cannot launch a browser for PDF rendering: ${(last as Error)?.message ?? last}`);
}

async function getBrowser(): Promise<Browser> {
  if (browserP) {
    const b = await browserP.catch(() => undefined);
    if (b?.isConnected()) return b;
    browserP = undefined;
  }
  const p = launch();
  browserP = p;
  p.catch(() => {
    if (browserP === p) browserP = undefined;
  });
  return p;
}

export async function closePdfBrowser(): Promise<void> {
  const p = browserP;
  browserP = undefined;
  if (p) await (await p.catch(() => undefined))?.close().catch(() => undefined);
}

/** HTML -> A4 PDF with Chromium. One lazily launched browser per process, one page per call. */
export async function htmlToPdf(html: string): Promise<Buffer> {
  const browser = await getBrowser();
  const ctx = await browser.newContext();
  try {
    const page = await ctx.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate('document.fonts.ready');
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '12mm', bottom: '12mm', left: '12mm', right: '12mm' },
    });
    return Buffer.from(pdf);
  } finally {
    await ctx.close().catch(() => undefined);
  }
}
