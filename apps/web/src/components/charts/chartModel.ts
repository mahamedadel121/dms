/** Pure helpers for the dashboard charts. */

/** Percent of the maximum for each value; a positive value never gets less than 2 percent. */
export function barWidths(values: number[]): number[] {
  const max = Math.max(0, ...values);
  if (max <= 0) return values.map(() => 0);
  return values.map((v) => (v > 0 ? Math.max(2, (v / max) * 100) : 0));
}

/** Rounds `max` up to a 1 / 2 / 2.5 / 5 / 10 times a power of ten, for axis scaling. */
export function niceMax(max: number): number {
  if (!(max > 0) || !Number.isFinite(max)) return 1;
  const exp = Math.floor(Math.log10(max));
  const base = 10 ** exp;
  const f = max / base;
  const steps = [1, 2, 2.5, 5, 10];
  const step = steps.find((s) => f <= s + 1e-9) ?? 10;
  return step * base;
}

/** Keeps the first `n` rows (caller sorts) and sums the rest. */
export function topWithOther<T>(rows: T[], n: number, value: (r: T) => number): { top: T[]; otherTotal: number; otherCount: number } {
  const top = rows.slice(0, n);
  const rest = rows.slice(n);
  return { top, otherTotal: rest.reduce((s, r) => s + value(r), 0), otherCount: rest.length };
}
