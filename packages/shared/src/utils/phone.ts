import { normalizeDigits } from './digits';

/**
 * Normalizes an Egyptian mobile number to E.164 (+201xxxxxxxxx).
 * Accepts +20..., 0020..., 20..., 01x... and bare 1x... forms. Returns null if not a valid mobile.
 */
export function normalizeEgyptPhone(input: string): string | null {
  let s = normalizeDigits(input).replace(/[\s\-().‎‏ ]/g, '');
  if (s.startsWith('+')) s = s.slice(1);
  if (s.startsWith('0020')) s = s.slice(4);
  else if (s.startsWith('20') && s.length === 12) s = s.slice(2);
  else if (s.startsWith('0') && s.length === 11) s = s.slice(1);
  if (!/^1[0125]\d{8}$/.test(s)) return null;
  return `+20${s}`;
}
