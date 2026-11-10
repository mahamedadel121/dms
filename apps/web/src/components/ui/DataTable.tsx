'use client';

import type { ReactNode } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';
import { Button } from './Button';
import { EmptyState, LoadingBlock } from './Display';

export interface Column<T> {
  key: string;
  header: ReactNode;
  /** custom cell; default reads `row[key]` */
  cell?: (row: T) => ReactNode;
  /** enables sort; the sort string sent is `${sortKey ?? key}:asc|desc` */
  sortable?: boolean;
  sortKey?: string;
  className?: string;
  /** hide this column in the mobile card layout */
  hideOnMobile?: boolean;
  /** use as the card heading on mobile (first column by default) */
  primary?: boolean;
}

export interface SortState {
  field: string;
  dir: 'asc' | 'desc';
}

export function parseSort(s: string | undefined): SortState | null {
  if (!s) return null;
  const [field, dir] = s.split(':');
  return field ? { field, dir: dir === 'desc' ? 'desc' : 'asc' } : null;
}

export interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, pageSize, total, onPageChange }: PaginationProps) {
  const { t, dir } = useT();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const Prev = dir === 'rtl' ? ChevronRight : ChevronLeft;
  const Next = dir === 'rtl' ? ChevronLeft : ChevronRight;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-3 py-2 text-sm text-slate-600">
      <span>{t('common.rowsTotal', { n: total })}</span>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => onPageChange(page - 1)} aria-label={t('common.previous')}>
          <Prev className="h-4 w-4" />
        </Button>
        <span>{t('common.pageOf', { page, pages })}</span>
        <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => onPageChange(page + 1)} aria-label={t('common.next')}>
          <Next className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string;
  loading?: boolean;
  page?: number;
  pageSize?: number;
  total?: number;
  onPageChange?: (page: number) => void;
  sort?: string;
  onSortChange?: (sort: string) => void;
  onRowClick?: (row: T) => void;
  emptyTitle?: ReactNode;
  emptyHint?: ReactNode;
  /** trailing actions cell/card footer */
  rowActions?: (row: T) => ReactNode;
}

function cellValue<T>(c: Column<T>, row: T): ReactNode {
  if (c.cell) return c.cell(row);
  const v = (row as Record<string, unknown>)[c.key];
  return v === null || v === undefined ? '' : (v as ReactNode);
}

/** Table on `md+`, stacked cards below. Sorting and paging are server-side (controlled). */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  page,
  pageSize,
  total,
  onPageChange,
  sort,
  onSortChange,
  onRowClick,
  emptyTitle,
  emptyHint,
  rowActions,
}: DataTableProps<T>) {
  const { t } = useT();
  const sortState = parseSort(sort);
  const toggle = (c: Column<T>) => {
    if (!onSortChange) return;
    const field = c.sortKey ?? c.key;
    const next = sortState?.field === field && sortState.dir === 'asc' ? 'desc' : 'asc';
    onSortChange(`${field}:${next}`);
  };

  if (loading && !rows) return <LoadingBlock />;
  if (rows && rows.length === 0) return <EmptyState title={emptyTitle} hint={emptyHint ?? t('common.emptyHint')} />;
  const list = rows ?? [];
  const primary = columns.find((c) => c.primary) ?? columns[0]!;

  return (
    <div className={cn(loading && 'opacity-60 transition-opacity')}>
      {/* desktop table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-start text-xs font-bold uppercase tracking-wide text-slate-500">
            <tr>
              {columns.map((c) => {
                const field = c.sortKey ?? c.key;
                const active = sortState?.field === field;
                return (
                  <th key={c.key} className={cn('px-3 py-2.5 text-start', c.className)}>
                    {c.sortable ? (
                      <button type="button" className="inline-flex items-center gap-1 hover:text-slate-800" onClick={() => toggle(c)}>
                        {c.header}
                        {active && (sortState!.dir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
              {rowActions && <th className="px-3 py-2.5" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {list.map((row) => (
              <tr key={rowKey(row)} className={cn('hover:bg-slate-50', onRowClick && 'cursor-pointer')} onClick={() => onRowClick?.(row)}>
                {columns.map((c) => (
                  <td key={c.key} className={cn('px-3 py-2.5 align-middle text-slate-800', c.className)}>
                    {cellValue(c, row)}
                  </td>
                ))}
                {rowActions && (
                  <td className="px-3 py-2.5 text-end" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end gap-1">{rowActions(row)}</div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* mobile cards */}
      <div className="space-y-3 p-3 md:hidden">
        {list.map((row) => (
          <div key={rowKey(row)} className={cn('rounded-lg border border-slate-200 bg-white p-3', onRowClick && 'cursor-pointer')} onClick={() => onRowClick?.(row)}>
            <div className="mb-2 font-bold text-slate-900">{cellValue(primary, row)}</div>
            <dl className="space-y-1">
              {columns
                .filter((c) => c !== primary && !c.hideOnMobile)
                .map((c) => (
                  <div key={c.key} className="flex justify-between gap-3 text-sm">
                    <dt className="text-slate-500">{c.header}</dt>
                    <dd className="text-end text-slate-800">{cellValue(c, row)}</dd>
                  </div>
                ))}
            </dl>
            {rowActions && (
              <div className="mt-3 flex justify-end gap-1 border-t border-slate-100 pt-2" onClick={(e) => e.stopPropagation()}>
                {rowActions(row)}
              </div>
            )}
          </div>
        ))}
      </div>
      {page !== undefined && pageSize !== undefined && total !== undefined && onPageChange && (
        <Pagination page={page} pageSize={pageSize} total={total} onPageChange={onPageChange} />
      )}
    </div>
  );
}
