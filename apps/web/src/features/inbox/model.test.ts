import { describe, expect, it } from 'vitest';
import { activeFilterCount, EMPTY_INBOX_FILTERS, toQueueQuery, type InboxFilters } from './model';

const base = (over: Partial<InboxFilters> = {}): InboxFilters => ({ ...EMPTY_INBOX_FILTERS, ...over });

describe('inbox model', () => {
  it('maps dates to Cairo day bounds', () => {
    // Cairo is UTC+2 in November (no daylight saving).
    const q = toQueueQuery(base({ from: '2026-11-01', to: '2026-11-10' }), 1);
    expect(q.from).toBe('2026-10-31T22:00:00.000Z');
    expect(q.to).toBe('2026-11-10T21:59:59.999Z');
  });

  it('sends overdue as 1', () => {
    expect(toQueueQuery(base({ overdue: true }), 2).overdue).toBe('1');
    expect(toQueueQuery(base({ overdue: false }), 2)).not.toHaveProperty('overdue');
  });

  it('drops empty filters', () => {
    const q = toQueueQuery(base(), 3);
    expect(q).toEqual({ tab: 'active', page: 3, pageSize: 25 });
    const q2 = toQueueQuery(base({ roleId: 'r1', minAmount: '100' }), 1);
    expect(q2).toEqual({ tab: 'active', roleId: 'r1', minAmount: '100', page: 1, pageSize: 25 });
  });

  it('counts active filters', () => {
    expect(activeFilterCount(base())).toBe(0);
    expect(activeFilterCount(base({ tab: 'awaiting', roleId: 'r1' }))).toBe(0);
    expect(activeFilterCount(base({ from: '2026-11-01', vehicleId: 'v', overdue: true, minWaitHours: '5' }))).toBe(4);
  });
});
