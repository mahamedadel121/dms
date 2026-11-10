import { describe, expect, it } from 'vitest';
import { groupByDay } from './groupByDay';

describe('groupByDay', () => {
  it('groups by Cairo day newest first', () => {
    const items = [
      { id: 'a', at: '2026-03-04T10:00:00Z' },
      { id: 'b', at: '2026-03-05T10:00:00Z' },
      // 22:30Z on the 4th is 00:30 on the 5th in Cairo (UTC+2 in early March)
      { id: 'c', at: '2026-03-04T22:30:00Z' },
    ];
    const groups = groupByDay(items, (i) => i.at);
    expect(groups.map((g) => g.day)).toEqual(['2026-03-05', '2026-03-04']);
    expect(groups[0]!.items.map((i) => i.id)).toEqual(['b', 'c']);
  });

  it('keeps item order inside a day', () => {
    const items = [
      { id: 'x', at: '2026-03-05T12:00:00Z' },
      { id: 'y', at: '2026-03-05T08:00:00Z' },
      { id: 'z', at: '2026-03-05T10:00:00Z' },
    ];
    const groups = groupByDay(items, (i) => i.at);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.items.map((i) => i.id)).toEqual(['x', 'y', 'z']);
  });
});
