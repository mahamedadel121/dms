// Realistic-looking receipt photos for the company demo: HTML snippets rendered by Chromium (correct Arabic shaping)
// and screenshotted as JPEG. Browser launch mirrors packages/core/src/pdf/browser.ts.
import type { Browser } from 'playwright';

export interface ReceiptSpec {
  kind: 'إيصال' | 'فاتورة';
  merchant: string;
  place: string;
  date: string;
  items: { label: string; value: string }[];
  amount: number;
  no: number;
  tilt?: number;
  stamp?: string;
}

export async function launchBrowser(): Promise<Browser> {
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
  throw new Error(`Cannot launch a browser for receipt images: ${(last as Error)?.message ?? last}`);
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

function html(r: ReceiptSpec): string {
  const rows = r.items.map((i) => `<tr><td>${esc(i.label)}</td><td class="v">${esc(i.value)}</td></tr>`).join('');
  return `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><style>
body{margin:0;background:#c9c3b6;width:460px;height:620px;display:flex;align-items:center;justify-content:center;font-family:'Segoe UI',Tahoma,'Noto Naskh Arabic','Cairo',Arial,sans-serif}
.paper{width:360px;background:#fff;padding:22px 24px 26px;transform:rotate(${r.tilt ?? 0}deg);box-shadow:0 6px 18px rgba(0,0,0,.35);color:#222;position:relative}
h1{margin:0 0 2px;font-size:22px;text-align:center}
.sub{text-align:center;font-size:13px;color:#555;margin-bottom:10px}
.kind{text-align:center;font-size:18px;font-weight:700;border-top:2px dashed #888;border-bottom:2px dashed #888;padding:6px 0;margin:8px 0}
.meta{display:flex;justify-content:space-between;font-size:13px;color:#444;margin-bottom:8px}
table{width:100%;border-collapse:collapse;font-size:15px}
td{padding:6px 0;border-bottom:1px dotted #bbb}.v{text-align:left;direction:ltr;font-variant-numeric:tabular-nums}
.total{display:flex;justify-content:space-between;font-size:20px;font-weight:700;margin-top:12px;border-top:2px solid #222;padding-top:8px}
.stamp{position:absolute;left:22px;bottom:18px;width:86px;height:86px;border:3px solid #2b4fa3;border-radius:50%;color:#2b4fa3;
 display:flex;align-items:center;justify-content:center;text-align:center;font-size:12px;font-weight:700;transform:rotate(-14deg);opacity:.75;line-height:1.3;padding:6px;box-sizing:border-box}
.thanks{text-align:center;font-size:12px;color:#777;margin-top:60px}
</style></head><body><div class="paper">
<h1>${esc(r.merchant)}</h1><div class="sub">${esc(r.place)}</div>
<div class="kind">${r.kind}</div>
<div class="meta"><span>رقم: ${r.no}</span><span>التاريخ: ${esc(r.date)}</span></div>
<table>${rows}</table>
<div class="total"><span>الإجمالي</span><span dir="ltr">${r.amount.toLocaleString('en-US')} EGP</span></div>
<div class="stamp">${esc(r.stamp ?? r.merchant)}</div>
<div class="thanks">شكراً لتعاملكم معنا</div>
</div></body></html>`;
}

export async function renderReceipt(browser: Browser, r: ReceiptSpec): Promise<Buffer> {
  const ctx = await browser.newContext({ viewport: { width: 460, height: 620 }, deviceScaleFactor: 1.5 });
  try {
    const page = await ctx.newPage();
    await page.setContent(html(r), { waitUntil: 'load' });
    await page.evaluate('document.fonts.ready');
    return Buffer.from(await page.screenshot({ type: 'jpeg', quality: 82 }));
  } finally {
    await ctx.close().catch(() => undefined);
  }
}
