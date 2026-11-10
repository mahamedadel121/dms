'use client';

import type { KeyboardEvent, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';
import { IconButton } from './Button';
import { EmptyState } from './Display';
import { Icon } from './Icon';
import { SkeletonRows } from './Skeleton';

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
  align?: 'start' | 'end' | 'center';
  /** tailwind width class, e.g. 'w-40' */
  width?: string;
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
  const { t } = useT();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex items-center justify-between gap-3 px-1 pt-3 text-sm text-ink-2">
      <span data-testid="pager-info">{t('ui.pager.range', { from, to, total })}</span>
      <div className="flex items-center gap-2">
        <IconButton
          size="sm"
          variant="secondary"
          icon={<Icon as={ChevronLeft} mirror size={16} />}
          label={t('ui.pager.prev')}
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          data-testid="pager-prev"
        />
        <span className="num">{t('ui.pager.page', { page, pages })}</span>
        <IconButton
          size="sm"
          variant="secondary"
          icon={<Icon as={ChevronRight} mirror size={16} />}
          label={t('ui.pager.next')}
          disabled={page >= pages}
          onClick={() => onPageChange(page + 1)}
          data-testid="pager-next"
        />
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
  testId?: string;
  mobileCard?: (row: T) => ReactNode;
  rowTone?: (row: T) => 'default' | 'danger' | 'muted';
  rowHref?: (row: T) => string;
  emptyAction?: ReactNode;
  emptyIcon?: ReactNode;
  stickyHeader?: boolean;
}

function cellValue<T>(c: Column<T>, row: T): ReactNode {
  if (c.cell) return c.cell(row);
  const v = (row as Record<string, unknown>)[c.key];
  return v === null || v === undefined ? '' : (v as ReactNode);
}

const alignCls = { start: 'text-start', end: 'text-end', center: 'text-center' };

/** Table on `md+`, list of cards below. Sorting and paging are server-side (controlled). */
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
  testId,
  mobileCard,
  rowTone,
  rowHref,
  emptyAction,
  emptyIcon,
  stickyHeader,
}: DataTableProps<T>) {
  const { t } = useT();
  const router = useRouter();
  const id = testId ?? 'table';
  const sortState = parseSort(sort);
  const toggle = (c: Column<T>) => {
    if (!onSortChange) return;
    const field = c.sortKey ?? c.key;
    const next = sortState?.field === field && sortState.dir === 'asc' ? 'desc' : 'asc';
    onSortChange(`${field}:${next}`);
  };

  if (loading && !rows) {
    return (
      <div data-testid={id} className="overflow-hidden rounded-lg border border-hairline bg-surface">
        <SkeletonRows />
      </div>
    );
  }
  if (rows && rows.length === 0) {
    return <EmptyState title={emptyTitle} hint={emptyHint ?? t('common.emptyHint')} action={emptyAction} icon={emptyIcon} />;
  }
  const list = rows ?? [];
  const primary = columns.find((c) => c.primary) ?? columns[0]!;
  const interactive = (row: T) => Boolean(onRowClick || rowHref?.(row));
  const activate = (row: T) => {
    const href = rowHref?.(row);
    if (href) router.push(href);
    else onRowClick?.(row);
  };
  const onKey = (e: KeyboardEvent, row: T) => {
    if (e.target === e.currentTarget && e.key === 'Enter') activate(row);
  };

  return (
    <div>
      {/* desktop table */}
      <div
        data-testid={id}
        className={cn('relative hidden overflow-x-auto rounded-lg border border-hairline bg-surface md:block', stickyHeader && 'max-h-[70vh] overflow-y-auto')}
      >
        <table className="min-w-full text-sm">
          <thead className={cn('bg-surface-2', stickyHeader && 'sticky top-0 z-sticky')}>
            <tr>
              {columns.map((c) => {
                const field = c.sortKey ?? c.key;
                const active = sortState?.field === field;
                return (
                  <th
                    key={c.key}
                    aria-sort={c.sortable ? (active ? (sortState!.dir === 'asc' ? 'ascending' : 'descending') : 'none') : undefined}
                    className={cn('h-10 whitespace-nowrap px-4 text-13 font-medium text-ink-2', alignCls[c.align ?? 'start'], c.width, c.className)}
                  >
                    {c.sortable ? (
                      <button type="button" className="inline-flex items-center gap-1 hover:text-ink" onClick={() => toggle(c)}>
                        {c.header}
                        {active ? (
                          <Icon as={sortState!.dir === 'asc' ? ArrowUp : ArrowDown} size={14} />
                        ) : (
                          <Icon as={ChevronsUpDown} size={14} className="text-ink-disabled" />
                        )}
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
              {rowActions && <th className="h-10 px-4" />}
            </tr>
            {loading && rows && (
              <tr aria-hidden>
                <th colSpan={columns.length + (rowActions ? 1 : 0)} className="h-0.5 p-0">
                  <div className="h-0.5 animate-pulse bg-primary/50" />
                </th>
              </tr>
            )}
          </thead>
          <tbody>
            {list.map((row) => {
              const tone = rowTone?.(row) ?? 'default';
              const clickable = interactive(row);
              return (
                <tr
                  key={rowKey(row)}
                  data-testid={id + '-row'}
                  data-row-key={rowKey(row)}
                  tabIndex={clickable ? 0 : undefined}
                  onClick={clickable ? () => activate(row) : undefined}
                  onKeyDown={clickable ? (e) => onKey(e, row) : undefined}
                  className={cn('h-row border-t border-hairline transition-colors duration-1 hover:bg-surface-2/60', clickable && 'cursor-pointer')}
                >
                  {columns.map((c, i) => (
                    <td
                      key={c.key}
                      className={cn(
                        'px-4 align-middle text-sm',
                        tone === 'muted' ? 'text-ink-3' : 'text-ink',
                        alignCls[c.align ?? 'start'],
                        i === 0 && tone === 'danger' && 'border-s-[3px] border-s-danger',
                        c.className,
                      )}
                    >
                      {cellValue(c, row)}
                    </td>
                  ))}
                  {rowActions && (
                    <td className="px-4 text-end" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">{rowActions(row)}</div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {/* mobile list */}
      <div className={cn('divide-y divide-hairline overflow-hidden rounded-lg border border-hairline bg-surface md:hidden', loading && 'opacity-60')}>
        {list.map((row) => {
          const tone = rowTone?.(row) ?? 'default';
          const clickable = interactive(row);
          return (
            <div
              key={rowKey(row)}
              data-testid={id + '-card'}
              data-row-key={rowKey(row)}
              tabIndex={clickable ? 0 : undefined}
              onClick={clickable ? () => activate(row) : undefined}
              onKeyDown={clickable ? (e) => onKey(e, row) : undefined}
              className={cn(
                'min-h-16 px-4 py-3',
                clickable && 'cursor-pointer active:bg-surface-2',
                tone === 'danger' && 'border-s-[3px] border-s-danger',
                tone === 'muted' && 'text-ink-3',
              )}
            >
              {mobileCard ? (
                mobileCard(row)
              ) : (
                <>
                  <div className="text-sm font-medium text-ink">{cellValue(primary, row)}</div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                    {columns
                      .filter((c) => c !== primary && !c.hideOnMobile)
                      .map((c) => (
                        <span key={c.key}>
                          <span className="text-ink-3">{c.header}</span> {cellValue(c, row)}
                        </span>
                      ))}
                  </div>
                </>
              )}
              {rowActions && (
                <div className="mt-2 flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                  {rowActions(row)}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {page !== undefined && pageSize !== undefined && total !== undefined && onPageChange && (
        <Pagination page={page} pageSize={pageSize} total={total} onPageChange={onPageChange} />
      )}
    </div>
  );
}
