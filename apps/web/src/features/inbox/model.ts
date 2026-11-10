import { cairoDayToIso } from '@/lib/format';

export interface InboxFilters {
  tab: 'active' | 'awaiting';
  roleId: string;
  from: string;
  to: string;
  submitterId: string;
  vehicleId: string;
  minAmount: string;
  maxAmount: string;
  overdue: boolean;
  minWaitHours: string;
}

export const EMPTY_INBOX_FILTERS: InboxFilters = {
  tab: 'active',
  roleId: '',
  from: '',
  to: '',
  submitterId: '',
  vehicleId: '',
  minAmount: '',
  maxAmount: '',
  overdue: false,
  minWaitHours: '',
};

export const INBOX_PAGE_SIZE = 25;

/** Filter keys the user sets in the filter bar (tab and role scope are not filters). */
export const FILTER_KEYS = ['from', 'to', 'submitterId', 'vehicleId', 'minAmount', 'maxAmount', 'minWaitHours', 'overdue'] as const;
export type FilterKey = (typeof FILTER_KEYS)[number];

/** Maps the UI filter state to the `/requests/queue` query. Empty filters are dropped. `minWaitHours` is client-side only. */
export function toQueueQuery(f: InboxFilters, page: number, pageSize: number = INBOX_PAGE_SIZE): Record<string, string | number> {
  const q: Record<string, string | number> = { tab: f.tab };
  if (f.roleId) q.roleId = f.roleId;
  if (f.from) q.from = cairoDayToIso(f.from);
  if (f.to) q.to = cairoDayToIso(f.to, true);
  if (f.submitterId) q.submitterId = f.submitterId;
  if (f.vehicleId) q.vehicleId = f.vehicleId;
  if (f.minAmount) q.minAmount = f.minAmount;
  if (f.maxAmount) q.maxAmount = f.maxAmount;
  if (f.overdue) q.overdue = '1';
  q.page = page;
  q.pageSize = pageSize;
  return q;
}

export function isFilterActive(f: InboxFilters, k: FilterKey): boolean {
  return k === 'overdue' ? f.overdue : f[k] !== '';
}

export function activeFilterCount(f: InboxFilters): number {
  return FILTER_KEYS.filter((k) => isFilterActive(f, k)).length;
}
