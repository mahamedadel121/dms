import { describe, expect, it } from 'vitest';
import { collapseEvents, groupByDay } from './timelineModel';
import type { EventDto } from '../types';

let n = 0;
function ev(type: string, createdAt: string): EventDto {
  n += 1;
  return { id: `e${n}`, type, createdAt, actorType: 'SYSTEM', actorName: null, stepInstanceId: null, lineId: null, attachmentId: null, comment: null, data: null };
}

describe('collapseEvents', () => {
  it('merges consecutive not-applicable events', () => {
    const items = collapseEvents([
      ev('SUBMITTED', '2026-10-20T10:00:00.000Z'),
      ev('STEP_NOT_APPLICABLE', '2026-10-20T10:00:01.000Z'),
      ev('STEP_NOT_APPLICABLE', '2026-10-20T10:00:02.000Z'),
      ev('STEP_NOT_APPLICABLE', '2026-10-20T10:00:03.000Z'),
      ev('STEP_APPROVED', '2026-10-20T11:00:00.000Z'),
    ]);
    expect(items.map((i) => i.kind)).toEqual(['event', 'skipped', 'event']);
    const g = items[1];
    expect(g?.kind === 'skipped' && g.count).toBe(3);
  });

  it('keeps a single one as a group of one', () => {
    const items = collapseEvents([ev('STEP_NOT_APPLICABLE', '2026-10-20T10:00:00.000Z')]);
    expect(items).toHaveLength(1);
    const g = items[0];
    expect(g?.kind).toBe('skipped');
    expect(g?.kind === 'skipped' && g.count).toBe(1);
  });

  it('drops a repeated arrival within the same second', () => {
    const items = collapseEvents([
      ev('STEP_ACTIVATED', '2026-10-20T10:00:00.100Z'),
      ev('STEP_ACTIVATED', '2026-10-20T10:00:00.700Z'),
      ev('STEP_ACTIVATED', '2026-10-20T10:00:05.000Z'),
    ]);
    expect(items).toHaveLength(2);
    const first = items[0];
    expect(first?.kind === 'event' && first.folded).toHaveLength(1);
  });
});

describe('groupByDay', () => {
  it('groupByDay orders days ascending', () => {
    const day = (iso: string) => iso.slice(0, 10);
    const groups = groupByDay(
      [{ at: '2026-10-22T09:00:00Z' }, { at: '2026-10-20T09:00:00Z' }, { at: '2026-10-20T18:00:00Z' }],
      day,
    );
    expect(groups.map((g) => g.day)).toEqual(['2026-10-20', '2026-10-22']);
    expect(groups[0]?.items).toHaveLength(2);
  });
});
