import { normalizeDigits } from './digits';
import { dec } from './decimal';

export interface ParseAmountOptions {
  /** accept 0 (approver edits). Default false: amount must be > 0. */
  allowZero?: boolean;
  maxDecimals?: number;
}

/**
 * Parses a human-typed amount (Arabic/Persian digits, thousands commas, decimal dot or
 * decimal comma). Returns a decimal string with exactly 2 decimals, or null when invalid.
 */
export function parseAmount(input: string | number, opts: ParseAmountOptions = {}): string | null {
  const maxDecimals = opts.maxDecimals ?? 2;
  let s = normalizeDigits(String(input)).replace(/[\s ‎‏]/g, '');
  if (!s) return null;
  const hasDot = s.includes('.');
  const hasComma = s.includes(',');
  if (hasDot && hasComma) {
    const lastDot = s.lastIndexOf('.');
    const lastComma = s.lastIndexOf(',');
    if (lastDot > lastComma) s = s.replace(/,/g, '');
    else s = s.replace(/\./g, '').replace(',', '.');
  } else if (hasComma) {
    if (/^\d{1,3}(,\d{3})+$/.test(s)) s = s.replace(/,/g, '');
    else if (/^\d*,\d+$/.test(s)) s = s.replace(',', '.');
    else return null;
  }
  if (!/^\d*\.?\d+$|^\d+\.$/.test(s)) return null;
  if (s.endsWith('.')) s = s.slice(0, -1);
  if (s.startsWith('.')) s = '0' + s;
  const d = dec(s);
  if (d.decimalPlaces() > maxDecimals) return null;
  if (d.isNegative()) return null;
  if (d.isZero() && !opts.allowZero) return null;
  if (d.greaterThan('999999999999.99')) return null;
  return d.toFixed(2);
}

/** Parses a non-negative integer (odometer, etc.). Returns null when invalid. */
export function parseInteger(input: string | number): number | null {
  let s = normalizeDigits(String(input)).replace(/[\s ‎‏]/g, '');
  if (/^\d{1,3}(,\d{3})+$/.test(s)) s = s.replace(/,/g, '');
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : null;
}
