export interface DayGroup<T> {
  /** yyyy-MM-dd in the Africa/Cairo zone */
  day: string;
  items: T[];
}

const FMT = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' });

/** Cairo calendar day (yyyy-MM-dd) of an ISO timestamp; '' when invalid. */
export function cairoDay(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : FMT.format(d);
}

/** Groups items by Cairo day, newest day first; the order of items inside a day is kept. */
export function groupByDay<T>(items: readonly T[], getDate: (item: T) => string): DayGroup<T>[] {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const day = cairoDay(getDate(item));
    const list = map.get(day);
    if (list) list.push(item);
    else map.set(day, [item]);
  }
  return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0)).map(([day, list]) => ({ day, items: list }));
}
