/** Cairo-timezone date and EGP money formatters. Pure, no React. */
export const CAIRO_TZ = 'Africa/Cairo';

type Loc = 'ar' | 'en';

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
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(n);
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
