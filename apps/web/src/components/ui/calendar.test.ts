import { describe, expect, it } from 'vitest';
import { addMonths, isValidDay, monthGrid, presetRange, toDisplay, type DatePreset } from './calendar';

describe('calendar', () => {
  it('monthGrid has 42 cells', () => {
    expect(monthGrid(2026, 2)).toHaveLength(42);
    expect(monthGrid(2026, 1)).toHaveLength(42);
  });

  it('starts on Saturday', () => {
    expect(monthGrid(2026, 2)[0]!.day).toBe('2026-02-28');
  });

  it('marks days outside the month', () => {
    const g = monthGrid(2026, 2);
    expect(g[0]!.inMonth).toBe(false);
    expect(g.find((c) => c.day === '2026-03-01')!.inMonth).toBe(true);
    expect(g.find((c) => c.day === '2026-03-31')!.inMonth).toBe(true);
    expect(g[41]!.inMonth).toBe(false);
  });

  it('addMonths crosses years', () => {
    expect(addMonths(2026, 11, 1)).toEqual({ year: 2027, month0: 0 });
    expect(addMonths(2026, 0, -1)).toEqual({ year: 2025, month0: 11 });
    expect(addMonths(2026, 5, 0)).toEqual({ year: 2026, month0: 5 });
  });

  it('toDisplay', () => {
    expect(toDisplay('2026-03-05')).toBe('05/03/2026');
    expect(toDisplay('')).toBe('');
    expect(toDisplay('nope')).toBe('');
  });

  it('isValidDay rejects 2026-02-30', () => {
    expect(isValidDay('2026-02-30')).toBe(false);
    expect(isValidDay('2026-02-28')).toBe(true);
    expect(isValidDay('2026-2-8')).toBe(false);
    expect(isValidDay('2028-02-29')).toBe(true);
  });

  const today = '2026-11-10';
  const cases: [DatePreset, { from: string; to: string }][] = [
    ['today', { from: '2026-11-10', to: '2026-11-10' }],
    ['last7', { from: '2026-11-04', to: '2026-11-10' }],
    ['last30', { from: '2026-10-12', to: '2026-11-10' }],
    ['thisMonth', { from: '2026-11-01', to: '2026-11-10' }],
    ['lastMonth', { from: '2026-10-01', to: '2026-10-31' }],
    ['thisYear', { from: '2026-01-01', to: '2026-11-10' }],
  ];
  for (const [p, want] of cases) {
    it(`presetRange ${p}`, () => {
      expect(presetRange(p, today)).toEqual(want);
    });
  }
});
