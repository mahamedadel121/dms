import type { Paged } from '@dms/shared';

export interface PageArgs {
  page?: number;
  pageSize?: number;
  sort?: string;
}

export function pageArgs(q: PageArgs): { skip: number; take: number; page: number; pageSize: number } {
  const page = q.page ?? 1;
  const pageSize = q.pageSize ?? 25;
  return { skip: (page - 1) * pageSize, take: pageSize, page, pageSize };
}

/** "field:desc" -> prisma orderBy, restricted to a whitelist of fields. */
export function orderByOf(sort: string | undefined, allowed: string[], fallback: Record<string, 'asc' | 'desc'>) {
  if (!sort) return fallback;
  const [field, dir] = sort.split(':');
  if (!field || !allowed.includes(field)) return fallback;
  return { [field]: dir === 'desc' ? 'desc' : 'asc' } as Record<string, 'asc' | 'desc'>;
}

export function paged<T>(items: T[], total: number, page: number, pageSize: number): Paged<T> {
  return { items, total, page, pageSize };
}

export const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);
