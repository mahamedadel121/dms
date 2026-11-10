/** {PREFIX}-{YY}-{000000}, e.g. DE-26-000123. `year` may be 4-digit or 2-digit. */
export function formatRequestNumber(prefix: string, year: number, seq: number): string {
  const yy = String(year % 100).padStart(2, '0');
  return `${prefix}-${yy}-${String(seq).padStart(6, '0')}`;
}
