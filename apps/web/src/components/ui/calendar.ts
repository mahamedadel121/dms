// Pure calendar helpers (no React). Days are 'yyyy-MM-dd' strings, computed in UTC so they never shift.

export type DatePreset = 'today' | 'last7' | 'last30' | 'thisMonth' | 'lastMonth' | 'thisYear';

const pad = (n: number, w = 2) => String(n).padStart(w, '0');
const fmt = (d: Date) => `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const utc = (y: number, m0: number, d: number) => new Date(Date.UTC(y, m0, d));

function parse(day: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = utc(y, mo - 1, d);
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d ? dt : null;
}

export function isValidDay(day: string): boolean {
  return parse(day) !== null;
}

/** '2026-03-05' -> '05/03/2026'; '' for invalid input. */
export function toDisplay(day: string): string {
  const d = parse(day);
  return d ? `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCFullYear(), 4)}` : '';
}

export function addMonths(year: number, month0: number, n: number): { year: number; month0: number } {
  const idx = year * 12 + month0 + n;
  return { year: Math.floor(idx / 12), month0: ((idx % 12) + 12) % 12 };
}

/** 42 cells (6 weeks) starting at the `weekStart` weekday (0 = Sunday .. 6 = Saturday, default Saturday). */
export function monthGrid(year: number, month0: number, weekStart = 6): { day: string; inMonth: boolean }[] {
  const first = utc(year, month0, 1);
  const offset = (first.getUTCDay() - weekStart + 7) % 7;
  const cells: { day: string; inMonth: boolean }[] = [];
  for (let i = 0; i < 42; i++) {
    const d = utc(year, month0, 1 - offset + i);
    cells.push({ day: fmt(d), inMonth: d.getUTCMonth() === month0 });
  }
  return cells;
}

/** Add whole days to a 'yyyy-MM-dd' string. */
export function addDays(day: string, n: number): string {
  const d = parse(day);
  if (!d) return day;
  d.setUTCDate(d.getUTCDate() + n);
  return fmt(d);
}

export function presetRange(p: DatePreset, today: string): { from: string; to: string } {
  const t = parse(today) ?? new Date();
  const y = t.getUTCFullYear();
  const m = t.getUTCMonth();
  switch (p) {
    case 'today':
      return { from: today, to: today };
    case 'last7':
      return { from: addDays(today, -6), to: today };
    case 'last30':
      return { from: addDays(today, -29), to: today };
    case 'thisMonth':
      return { from: fmt(utc(y, m, 1)), to: today };
    case 'lastMonth':
      return { from: fmt(utc(y, m - 1, 1)), to: fmt(utc(y, m, 0)) };
    case 'thisYear':
      return { from: fmt(utc(y, 0, 1)), to: today };
  }
}
