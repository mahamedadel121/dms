import Decimal from 'decimal.js';

const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export type DecimalLike = string | number | Decimal | { toString(): string };

export function dec(v: DecimalLike): Decimal {
  return new D(typeof v === 'object' && !(v instanceof Decimal) ? v.toString() : (v as string | number | Decimal));
}

/** Sum of decimal values, returned as a string with 2 decimals. */
export function sumDecimals(values: DecimalLike[]): string {
  return values.reduce<Decimal>((acc, v) => acc.plus(dec(v)), new D(0)).toFixed(2);
}

/** a / b rounded half-up to `dp` decimals (default 2). Division by zero returns null. */
export function divDecimal(a: DecimalLike, b: DecimalLike, dp = 2): string | null {
  const d = dec(b);
  if (d.isZero()) return null;
  return dec(a).div(d).toFixed(dp, Decimal.ROUND_HALF_UP);
}

export function toFixed2(v: DecimalLike): string {
  return dec(v).toFixed(2, Decimal.ROUND_HALF_UP);
}

export function decimalCompare(a: DecimalLike, b: DecimalLike): -1 | 0 | 1 {
  return dec(a).comparedTo(dec(b)) as -1 | 0 | 1;
}

export function hasMaxDecimals(v: DecimalLike, dp: number): boolean {
  return dec(v).decimalPlaces() <= dp;
}
