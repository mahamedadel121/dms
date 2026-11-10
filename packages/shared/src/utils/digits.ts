const ARABIC_INDIC_ZERO = 0x0660;
const PERSIAN_ZERO = 0x06f0;

/**
 * Converts Arabic-Indic (U+0660..) and Persian (U+06F0..) digits to ASCII and maps
 * Arabic decimal/thousands separators to '.' and ','.
 */
export function normalizeDigits(input: string): string {
  let out = '';
  for (const ch of input) {
    const c = ch.codePointAt(0)!;
    if (c >= ARABIC_INDIC_ZERO && c <= ARABIC_INDIC_ZERO + 9) out += String(c - ARABIC_INDIC_ZERO);
    else if (c >= PERSIAN_ZERO && c <= PERSIAN_ZERO + 9) out += String(c - PERSIAN_ZERO);
    else if (c === 0x066b) out += '.';
    else if (c === 0x066c) out += ',';
    else if (c === 0x060c) out += ',';
    else out += ch;
  }
  return out;
}
