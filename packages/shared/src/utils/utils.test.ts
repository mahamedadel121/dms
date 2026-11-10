import { describe, expect, it } from 'vitest';
import {
  normalizeDigits,
  parseAmount,
  parseInteger,
  normalizeEgyptPhone,
  formatRequestNumber,
  sumDecimals,
  divDecimal,
  toFixed2,
  decimalCompare,
  formatCairo,
  cairoYear2,
  cairoDateString,
  conditionSchema,
  templateConfigSchema,
  PERMISSIONS,
  ALL_PERMISSION_CODES,
  PERMISSION_META,
} from '../index';

describe('normalizeDigits', () => {
  it('converts Arabic-Indic and Persian digits', () => {
    expect(normalizeDigits('٠١٢٣٤٥٦٧٨٩')).toBe('0123456789');
    expect(normalizeDigits('۰۱۲۳۴۵۶۷۸۹')).toBe('0123456789');
    expect(normalizeDigits('٢١٥٧ abc')).toBe('2157 abc');
    expect(normalizeDigits('١٬٢٥٠٫٥٠')).toBe('1,250.50');
  });
});

describe('parseAmount', () => {
  it.each([
    ['250', '250.00'],
    ['١٢٥٠', '1250.00'],
    ['۱۲۵۰٫۵', '1250.50'],
    ['1,250.50', '1250.50'],
    ['1.250,50', '1250.50'],
    ['12,5', '12.50'],
    ['1,250', '1250.00'],
    ['  99.9 ', '99.90'],
    ['.5', '0.50'],
  ])('%s -> %s', (i, o) => expect(parseAmount(i)).toBe(o));
  it.each(['', 'abc', '0', '-5', '1.234', '12a', '1,2,3x', '--1'])('rejects %s', (i) =>
    expect(parseAmount(i)).toBeNull(),
  );
  it('allows zero when asked', () => expect(parseAmount('0', { allowZero: true })).toBe('0.00'));
  it('accepts numbers', () => expect(parseAmount(12.5)).toBe('12.50'));
});

describe('parseInteger', () => {
  it('parses', () => {
    expect(parseInteger('١٢٣٤٥')).toBe(12345);
    expect(parseInteger('123,456')).toBe(123456);
    expect(parseInteger('0')).toBe(0);
  });
  it('rejects', () => {
    expect(parseInteger('12.5')).toBeNull();
    expect(parseInteger('-1')).toBeNull();
    expect(parseInteger('x')).toBeNull();
    expect(parseInteger('')).toBeNull();
  });
});

describe('normalizeEgyptPhone', () => {
  it.each([
    ['+201012345678', '+201012345678'],
    ['01012345678', '+201012345678'],
    ['0020 101 234 5678', '+201012345678'],
    ['201012345678', '+201012345678'],
    ['١٠١٢٣٤٥٦٧٨', '+201012345678'],
    ['٠١٠١٢٣٤٥٦٧٨', '+201012345678'],
    ['010-1234-5678', '+201012345678'],
    ['+20 112 345 6789', '+201123456789'],
    ['01212345678', '+201212345678'],
    ['01512345678', '+201512345678'],
  ])('%s', (i, o) => expect(normalizeEgyptPhone(i)).toBe(o));
  it.each(['', '12345', '01312345678', '+9665012345678', '0101234567', '010123456789'])('rejects %s', (i) =>
    expect(normalizeEgyptPhone(i)).toBeNull(),
  );
});

describe('formatRequestNumber', () => {
  it('formats', () => {
    expect(formatRequestNumber('DE', 26, 123)).toBe('DE-26-000123');
    expect(formatRequestNumber('DE', 2026, 1)).toBe('DE-26-000001');
    expect(formatRequestNumber('DE', 26, 1234567)).toBe('DE-26-1234567');
  });
  it('is 12 chars for DE', () => expect(formatRequestNumber('DE', 26, 999999)).toHaveLength(12));
});

describe('decimal helpers', () => {
  it('sums exactly', () => {
    expect(sumDecimals(['0.1', '0.2'])).toBe('0.30');
    expect(sumDecimals([])).toBe('0.00');
    expect(sumDecimals(['100', 50.25])).toBe('150.25');
  });
  it('divides with half-up 2dp', () => {
    expect(divDecimal('100', '3')).toBe('33.33');
    expect(divDecimal('1', '8')).toBe('0.13');
    expect(divDecimal('1', '0')).toBeNull();
  });
  it('toFixed2 / compare', () => {
    expect(toFixed2('1.005')).toBe('1.01');
    expect(decimalCompare('2', '10')).toBe(-1);
    expect(decimalCompare('10.00', '10')).toBe(0);
  });
});

describe('formatCairo', () => {
  it('uses Cairo time (winter UTC+2, summer UTC+3)', () => {
    expect(formatCairo(new Date('2026-01-15T10:30:00Z'))).toBe('2026-01-15 12:30');
    expect(formatCairo(new Date('2026-07-15T10:30:00Z'))).toBe('2026-07-15 13:30');
  });
  it('rolls the date over at Cairo midnight', () => {
    const d = new Date('2026-12-31T22:30:00Z');
    expect(cairoDateString(d)).toBe('2027-01-01');
    expect(cairoYear2(d)).toBe(27);
  });
  it('seconds', () => expect(formatCairo(new Date('2026-01-15T10:30:05Z'), { seconds: true })).toBe('2026-01-15 12:30:05'));
});

describe('schemas and constants', () => {
  it('parses nested conditions', () => {
    const c = {
      type: 'AND',
      conditions: [
        { type: 'LINE_CATEGORY_IN', categoryCodes: ['TIPS'] },
        { type: 'NOT', condition: { type: 'TOTAL_AMOUNT', op: 'gt', value: '1000.50' } },
        { type: 'FIELD', field: 'header.odometer', op: 'in', value: ['1', '2'] },
      ],
    };
    expect(conditionSchema.safeParse(c).success).toBe(true);
    expect(conditionSchema.safeParse({ type: 'TOTAL_AMOUNT', op: 'gt', value: 'abc' }).success).toBe(false);
    expect(conditionSchema.safeParse({ type: 'NOPE' }).success).toBe(false);
  });
  it('template config', () => {
    const ok = templateConfigSchema.safeParse({
      titleAr: 'كشف مصاريف',
      headerFields: [],
      lineColumns: [{ key: 'extra.liters', labelAr: 'لتر', show: true }],
      showOriginalValues: true,
      showAmountInWords: true,
      signature: { perRow: 4, showDateTime: true, submitterLabelAr: 'السائق' },
    });
    expect(ok.success).toBe(true);
  });
  it('permission metadata covers every code exactly once', () => {
    expect(PERMISSION_META.map((p) => p.code).sort()).toEqual([...ALL_PERMISSION_CODES].sort());
    expect(PERMISSIONS.REQUESTS_ACT).toBe('requests.act');
    expect(ALL_PERMISSION_CODES).toHaveLength(30);
  });
});
