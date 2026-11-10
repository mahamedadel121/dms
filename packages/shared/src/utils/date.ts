export const CAIRO_TZ = 'Africa/Cairo';

interface CairoParts {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
}

const fmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: CAIRO_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

export function cairoParts(date: Date): CairoParts {
  const out: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) out[p.type] = p.value;
  return out as unknown as CairoParts;
}

/** 'yyyy-MM-dd HH:mm' (or with seconds) in Africa/Cairo. */
export function formatCairo(date: Date | string | number, o: { seconds?: boolean; dateOnly?: boolean } = {}): string {
  const p = cairoParts(new Date(date));
  const d = `${p.year}-${p.month}-${p.day}`;
  if (o.dateOnly) return d;
  return `${d} ${p.hour}:${p.minute}${o.seconds ? ':' + p.second : ''}`;
}

/** Cairo calendar date as yyyy-MM-dd. */
export function cairoDateString(date: Date): string {
  return formatCairo(date, { dateOnly: true });
}

/** Two-digit Cairo year (e.g. 26). */
export function cairoYear2(date: Date): number {
  return Number(cairoParts(date).year) % 100;
}
