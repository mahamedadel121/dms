import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { DocumentModel, SignatureBlock } from './model';
import { fmtMoney } from './model';

export function escapeHtml(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const ARABIC_RANGE =
  'U+0600-06FF,U+0750-077F,U+0870-088E,U+0890-0891,U+0897-08E1,U+08E3-08FF,U+200C-200E,U+2010-2011,U+204F,U+2E41,U+FB50-FDFF,U+FE70-FE74,U+FE76-FEFC';
const LATIN_RANGE = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+20AC,U+2122,U+2212,U+FEFF';

let fontCss: string | undefined;
/** Cairo 400/700 (Arabic + Latin) embedded as base64 so rendering works offline. */
export function getFontCss(): string {
  if (fontCss !== undefined) return fontCss;
  try {
    const req = createRequire(join(process.cwd(), 'noop.js'));
    const dir = join(dirname(req.resolve('@fontsource/cairo/package.json')), 'files');
    const face = (subset: 'arabic' | 'latin', weight: 400 | 700, range: string) => {
      const b64 = readFileSync(join(dir, `cairo-${subset}-${weight}-normal.woff2`)).toString('base64');
      return `@font-face{font-family:'Cairo';font-style:normal;font-weight:${weight};src:url(data:font/woff2;base64,${b64}) format('woff2');unicode-range:${range};}`;
    };
    fontCss = [
      face('arabic', 400, ARABIC_RANGE),
      face('arabic', 700, ARABIC_RANGE),
      face('latin', 400, LATIN_RANGE),
      face('latin', 700, LATIN_RANGE),
    ].join('\n');
  } catch {
    fontCss = ''; // falls back to system fonts
  }
  return fontCss;
}

const CSS = `
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{font-family:"Cairo","Segoe UI","Tahoma","Arial",sans-serif;font-size:12px;color:#111;direction:rtl}
.top{display:flex;align-items:center;gap:16px;border-bottom:2px solid #1a2a6c;padding-bottom:8px;margin-bottom:10px}
.logo{height:56px;max-width:140px;object-fit:contain;width:140px}
.titles{flex:1;text-align:center}
.company{font-size:13px;font-weight:700;color:#333}
.title{font-size:22px;font-weight:700;color:#1a2a6c;margin:0}
.title-en{font-size:11px;color:#666;direction:ltr}
.preview-banner{background:#fff3cd;border:1px solid #e0a800;color:#7a5a00;padding:4px 8px;text-align:center;font-weight:700;margin-bottom:8px}
table{width:100%;border-collapse:collapse}
.hdr td{border:1px solid #bbb;padding:4px 8px}
.hdr td.k{background:#eef1f8;font-weight:700;width:14%}
.hdr td.v{width:19%}
.lines{margin-top:12px}
.lines th{background:#1a2a6c;color:#fff;padding:5px 6px;border:1px solid #1a2a6c;font-weight:700}
.lines td{border:1px solid #bbb;padding:4px 6px;text-align:center}
.lines td.c-category{text-align:right}
.lines td.edited{background:#fff8e1;font-weight:700}
.lines td.orig-strike{text-decoration:line-through;color:#777}
.num{direction:ltr;unicode-bidi:embed}
.totals{margin-top:10px;border:1px solid #1a2a6c;padding:8px 10px;page-break-inside:avoid}
.totals .row{display:flex;justify-content:space-between;gap:12px;padding:2px 0}
.totals .grand{font-size:15px;font-weight:700;color:#1a2a6c}
.words{font-weight:700}
.footer-note{margin-top:8px;color:#555;font-size:11px}
.sigs{margin-top:18px;display:grid;gap:10px;page-break-inside:avoid}
.sig-block{border:1px solid #999;padding:6px;min-height:96px;text-align:center}
.sig-role{font-weight:700;font-size:12px;color:#1a2a6c}
.sig-name{font-size:12px;margin-top:2px}
.sig-obo{font-size:10px;color:#666}
.sig-img{height:44px;max-width:100%;object-fit:contain;display:block;margin:4px auto}
.sig-noimg{height:44px}
.sig-at{font-size:10px;color:#555;direction:ltr}
`;

function sigHtml(b: SignatureBlock): string {
  return `<div class="sig-block" data-kind="${b.kind}" data-role="${escapeHtml(b.title)}">
<div class="sig-role">${escapeHtml(b.title)}</div>
<div class="sig-name">${escapeHtml(b.name)}</div>
${b.onBehalfOf ? `<div class="sig-obo">${escapeHtml(b.onBehalfOf)}</div>` : ''}
${b.imageDataUri ? `<img class="sig-img" alt="" src="${b.imageDataUri}"/>` : '<div class="sig-noimg"></div>'}
${b.at ? `<div class="sig-at">${escapeHtml(b.at)}</div>` : ''}
</div>`;
}

export function renderDocumentHtml(m: DocumentModel): string {
  const hdrCells = m.headerRows.map(
    (r) => `<td class="k">${escapeHtml(r.label)}</td><td class="v">${/^[\d:\s.,/-]+$/.test(r.value) ? `<span dir="ltr">${escapeHtml(r.value)}</span>` : escapeHtml(r.value)}</td>`,
  );
  const hdrRows: string[] = [];
  for (let i = 0; i < hdrCells.length; i += 3) hdrRows.push(`<tr>${hdrCells.slice(i, i + 3).join('')}</tr>`);

  const numeric = new Set(['originalAmount', 'amount', 'quantity', 'unitPrice']);
  const head = m.columns.map((c) => `<th>${escapeHtml(c.label)}</th>`).join('');
  const body = m.lines
    .map(
      (l) =>
        `<tr class="line">${m.columns
          .map((c) => {
            const v = l.cells[c.key] ?? '';
            const cls = [`c-${c.key.replace(/\W/g, '-')}`];
            if (l.edited && c.key === 'amount') cls.push('edited');
            if (l.edited && c.key === 'originalAmount') cls.push('orig-strike');
            return `<td class="${cls.join(' ')}">${numeric.has(c.key) ? `<span class="num">${escapeHtml(v)}</span>` : escapeHtml(v)}</td>`;
          })
          .join('')}</tr>`,
    )
    .join('');

  const perRow = Math.max(1, m.signaturePerRow);
  return `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"/><title>${escapeHtml(m.titleAr)} ${escapeHtml(m.requestNumber)}</title>
<style>${getFontCss()}${CSS}</style></head>
<body class="layout-${escapeHtml(m.layoutKey)}"><div class="page">
${m.isFinal ? '' : '<div class="preview-banner">معاينة - المستند غير نهائي</div>'}
<div class="top">
${m.logoDataUri ? `<img class="logo" alt="" src="${m.logoDataUri}"/>` : '<div class="logo"></div>'}
<div class="titles">${m.companyNameAr ? `<div class="company">${escapeHtml(m.companyNameAr)}</div>` : ''}<h1 class="title">${escapeHtml(m.titleAr)}</h1>${m.titleEn ? `<div class="title-en">${escapeHtml(m.titleEn)}</div>` : ''}</div>
<div style="width:140px"></div>
</div>
<table class="hdr">${hdrRows.join('')}</table>
<table class="lines"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
<div class="totals">
${m.showOriginalTotal ? `<div class="row"><span>الإجمالي الأصلي</span><span class="num">${escapeHtml(fmtMoney(m.totalOriginal))} ${escapeHtml(m.currency)}</span></div>` : ''}
<div class="row grand"><span>الإجمالي</span><span class="num total-digits">${escapeHtml(fmtMoney(m.totalFinal))} ${escapeHtml(m.currency)}</span></div>
${m.amountWords ? `<div class="row"><span class="words total-words">${escapeHtml(m.amountWords)}</span></div>` : ''}
</div>
${m.footerNoteAr ? `<div class="footer-note">${escapeHtml(m.footerNoteAr)}</div>` : ''}
<div class="sigs" style="grid-template-columns:repeat(${perRow},1fr)">${m.signatures.map(sigHtml).join('')}</div>
</div></body></html>`;
}
