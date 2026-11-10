import { describe, expect, it } from 'vitest';
import { barWidths, niceMax, topWithOther } from './chartModel';

describe('chartModel', () => {
  it('barWidths scales to the max', () => {
    expect(barWidths([50, 100, 25])).toEqual([50, 100, 25]);
    expect(barWidths([0, 0])).toEqual([0, 0]);
  });

  it('gives a minimum width to small values', () => {
    const [a, b] = barWidths([1, 10000]);
    expect(a).toBe(2);
    expect(b).toBe(100);
    expect(barWidths([0, 10000])[0]).toBe(0);
  });

  it('niceMax', () => {
    expect(niceMax(0)).toBe(1);
    expect(niceMax(7)).toBe(10);
    expect(niceMax(13668)).toBe(20000);
    expect(niceMax(25344)).toBe(50000);
    expect(niceMax(100)).toBe(100);
    expect(niceMax(2.2)).toBe(2.5);
  });

  it('topWithOther splits and sums', () => {
    const rows = [{ v: 5 }, { v: 4 }, { v: 3 }, { v: 2 }, { v: 1 }];
    const r = topWithOther(rows, 3, (x) => x.v);
    expect(r.top).toHaveLength(3);
    expect(r.otherTotal).toBe(3);
    expect(r.otherCount).toBe(2);
    expect(topWithOther(rows, 10, (x) => x.v)).toEqual({ top: rows, otherTotal: 0, otherCount: 0 });
  });
});
