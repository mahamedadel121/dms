/** Cairo-timezone date and EGP money formatters. Pure, no React. */
export const CAIRO_TZ = 'Africa/Cairo';

type Loc = 'ar' | 'en';

export type NumeralSystem = 'latn' | 'arab';
let numerals: NumeralSystem = 'latn';
/** Process-wide numeral system for display formatting. Set by PrefsProvider. Default 'latn'. */
export function setNumeralSystem(n: NumeralSystem): void {
  numerals = n;
}
export function getNumeralSystem(): NumeralSystem {
  return numerals;
}
function numLocale(): string {
  return `en-US-u-nu-${numerals}`;
}

function toDate(v: Date | string | number | null | undefined): Date | null {
  if (v === null || v === undefined || v === '') return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

const fmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: CAIRO_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function parts(d: Date): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of fmt.formatToParts(d)) out[p.type] = p.value;
  return out;
}

/** `2026-03-05` in Cairo. Empty string for null/invalid input. */
export function formatDate(v: Date | string | number | null | undefined): string {
  const d = toDate(v);
  if (!d) return '';
  const p = parts(d);
  return `${p.year}-${p.month}-${p.day}`;
}

/** `2026-03-05 14:30` in Cairo. */
export function formatDateTime(v: Date | string | number | null | undefined): string {
  const d = toDate(v);
  if (!d) return '';
  const p = parts(d);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

/** Today's Cairo calendar date as `yyyy-MM-dd` (for date inputs). */
export function todayCairo(now: Date = new Date()): string {
  return formatDate(now);
}

/**
 * Converts a `yyyy-MM-dd` date-input value to the ISO instant of the start (or end) of that
 * calendar day in Cairo. Cairo is UTC+2 / UTC+3 (DST); the offset is resolved for that day.
 */
export function cairoDayToIso(day: string, end = false): string {
  const [y, m, d] = day.split('-').map(Number);
  const wall = Date.UTC(y!, m! - 1, d!, end ? 23 : 0, end ? 59 : 0, end ? 59 : 0, end ? 999 : 0);
  // First guess: wall time as UTC; measure how Cairo shows that instant, correct by the difference.
  const p = parts(new Date(wall));
  const shown = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute));
  const offset = shown - Math.floor(wall / 60000) * 60000;
  let instant = wall - offset;
  // Re-check once in case the offset differs at the corrected instant (DST boundary).
  const p2 = parts(new Date(instant));
  const shown2 = Date.UTC(Number(p2.year), Number(p2.month) - 1, Number(p2.day), Number(p2.hour), Number(p2.minute));
  const offset2 = shown2 - Math.floor(instant / 60000) * 60000;
  if (offset2 !== offset) instant = wall - offset2;
  return new Date(instant).toISOString();
}

/** Decimal string (or number) with thousands separators: `1,234.50`. */
export function formatNumber(v: string | number | null | undefined, decimals = 2): string {
  if (v === null || v === undefined || v === '') return '';
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return String(v);
  return new Intl.NumberFormat(numLocale(), { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(n);
}

/** `1,234.50 ج.م` / `EGP 1,234.50`. Latin digits are kept for accounting readability. */
export function formatEgp(v: string | number | null | undefined, locale: Loc = 'ar'): string {
  const s = formatNumber(v);
  if (!s) return '';
  return locale === 'ar' ? `${s} ج.م` : `EGP ${s}`;
}

/** Human file size. */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** Wraps an identifier in LRI/PDI so it never reorders inside RTL text. */
export function ltrIsolate(s: string): string {
  return `⁦${s}⁩`;
}

/** Integer or decimal count with separators, honouring the numeral system: formatCount(1234) -> '1,234'. */
export function formatCount(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === '') return '';
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return String(v);
  return new Intl.NumberFormat(numLocale(), { maximumFractionDigits: 20 }).format(n);
}

/** Percent with one decimal: formatPercent(0.1234) -> '12.3%'. */
export function formatPercent(ratio: number): string {
  const s = new Intl.NumberFormat(numLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(ratio * 100);
  return `${s}${numerals === 'arab' ? '٪' : '%'}`;
}

const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

function digits(s: string): string {
  if (numerals !== 'arab') return s;
  return s.replace(/[0-9]/g, (d) => String.fromCharCode(0x0660 + Number(d)));
}

/** '05/03/2026' (short) or '5 مارس 2026' / '5 March 2026' (long), Africa/Cairo. '' for null/invalid. */
export function formatDay(v: Date | string | number | null | undefined, locale: Loc = 'ar', style: 'short' | 'long' = 'short'): string {
  const d = toDate(v);
  if (!d) return '';
  const p = parts(d);
  if (style === 'short') return digits(`${p.day}/${p.month}/${p.year}`);
  const month = (locale === 'ar' ? MONTHS_AR : MONTHS_EN)[Number(p.month) - 1] ?? '';
  return digits(`${Number(p.day)} ${month} ${p.year}`);
}

/** '14:30' (Cairo). */
export function formatTime(v: Date | string | number | null | undefined): string {
  const d = toDate(v);
  if (!d) return '';
  const p = parts(d);
  return digits(`${p.hour}:${p.minute}`);
}

/** '05/03/2026 14:30' (24h, Cairo). */
export function formatDayTime(v: Date | string | number | null | undefined, locale: Loc = 'ar'): string {
  const d = toDate(v);
  if (!d) return '';
  return `${formatDay(d, locale, 'short')} ${formatTime(d)}`;
}

/** Relative time; older than 7 days falls back to formatDay short. Strings mirror the `ui.rel.*` keys. */
export function formatRelative(v: Date | string | number | null | undefined, locale: Loc = 'ar', now: number = Date.now()): string {
  const d = toDate(v);
  if (!d) return '';
  const diff = Math.max(0, now - d.getTime());
  const min = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  const n = (x: number) => digits(String(x));
  const ar = locale === 'ar';
  if (min < 1) return ar ? 'الآن' : 'now';
  if (min < 60) return ar ? `منذ ${n(min)} دقيقة` : `${n(min)} min ago`;
  if (hours < 24) return ar ? `منذ ${n(hours)} ساعة` : `${n(hours)} h ago`;
  if (days < 2) return ar ? 'أمس' : 'yesterday';
  if (days <= 7) return ar ? `منذ ${n(days)} أيام` : `${n(days)} days ago`;
  return formatDay(d, locale, 'short');
}
