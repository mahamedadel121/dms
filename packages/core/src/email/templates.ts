export interface EmailNotificationView {
  type: string;
  titleAr: string | null;
  titleEn: string | null;
  bodyAr: string;
  bodyEn: string | null;
  link: string | null;
  requestNumber: string | null;
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function renderEmail(
  n: EmailNotificationView,
  o: { locale: 'ar' | 'en'; webUrl: string; appNameAr?: string; appNameEn?: string },
): { subject: string; html: string; text: string } {
  const ar = o.locale === 'ar';
  const body = ar ? n.bodyAr : (n.bodyEn ?? n.bodyAr);
  const rawTitle = ar ? n.titleAr : (n.titleEn ?? n.titleAr);
  const title = rawTitle && rawTitle.trim() ? rawTitle : body.slice(0, 80);
  const subject = n.requestNumber ? `[${n.requestNumber}] ${title}` : title;
  const appName = ar ? (o.appNameAr ?? 'نظام إدارة المستندات') : (o.appNameEn ?? 'DMS');
  const absLink = n.link && n.link.startsWith('/') ? o.webUrl.replace(/\/+$/, '') + n.link : null;
  const buttonLabel = ar ? 'فتح الطلب' : 'Open request';
  const footer = ar ? 'رسالة آلية من نظام إدارة المستندات، لا ترد عليها.' : 'Automated message from DMS; do not reply.';
  const align = ar ? 'right' : 'left';
  const font = "Tahoma, 'Segoe UI', Arial, sans-serif";

  const button = absLink
    ? `<tr><td style="padding:8px 24px 24px 24px;text-align:${align};"><a href="${escapeHtml(absLink)}" style="display:inline-block;background:#14284B;color:#ffffff;text-decoration:none;border-radius:6px;padding:10px 22px;font-size:15px;font-family:${escapeHtml(font)};">${escapeHtml(buttonLabel)}</a></td></tr>`
    : '';

  const html =
    `<!DOCTYPE html><html dir="${ar ? 'rtl' : 'ltr'}" lang="${ar ? 'ar' : 'en'}"><head><meta charset="utf-8"><title>${escapeHtml(subject)}</title></head>` +
    `<body style="margin:0;padding:0;background:#FAF7F2;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAF7F2;"><tr><td align="center" style="padding:24px 12px;">` +
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;font-family:${escapeHtml(font)};">` +
    `<tr><td style="background:#14284B;color:#ffffff;padding:16px 24px;font-size:18px;font-weight:bold;text-align:${align};">${escapeHtml(appName)}</td></tr>` +
    `<tr><td style="height:2px;line-height:2px;font-size:0;background:#C9A45C;">&nbsp;</td></tr>` +
    `<tr><td style="padding:24px 24px 8px 24px;font-size:20px;color:#16202F;font-weight:bold;text-align:${align};">${escapeHtml(title)}</td></tr>` +
    `<tr><td style="padding:8px 24px 16px 24px;font-size:15px;line-height:1.8;color:#16202F;text-align:${align};">${escapeHtml(body).replace(/\r?\n/g, '<br>')}</td></tr>` +
    button +
    `<tr><td style="padding:16px 24px;font-size:12px;color:#6B7280;border-top:1px solid #eeeeee;text-align:${align};">${escapeHtml(footer)}</td></tr>` +
    `</table></td></tr></table></body></html>`;

  const text = [title, '', body, ...(absLink ? ['', absLink] : [])].join('\n');
  return { subject, html, text };
}
