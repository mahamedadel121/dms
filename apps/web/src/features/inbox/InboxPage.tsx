'use client';

import { useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCheck, ChevronRight, Clock, Lock, MessageSquareWarning } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import {
  Avatar, Badge, Button, Code, DataTable, DateRange, EmptyState, ErrorBlock, FilterBar, FilterChip, FormField, Icon, Input, LookupSelect, Money,
  Page, PageHeader, Popover, SegmentedControl, Switch, Tabs, toDisplay, type Column,
} from '@/components/ui';
import { useTr } from '../common/useTr';
import { formatWaiting, waitingHours } from '../requests/helpers';
import type { Paged, QueueCounter, QueueItem } from '../types';
import { activeFilterCount, EMPTY_INBOX_FILTERS, INBOX_PAGE_SIZE, toQueueQuery, type InboxFilters } from './model';

export function InboxPage() {
  const { t, locale } = useTr();
  const [f, setF] = useState<InboxFilters>(EMPTY_INBOX_FILTERS);
  const [page, setPage] = useState(1);
  const set = <K extends keyof InboxFilters>(k: K, v: InboxFilters[K]) => {
    setF((p) => ({ ...p, [k]: v }));
    setPage(1);
  };

  const counters = useQuery({
    queryKey: ['queue-counters'],
    queryFn: () => api.get<QueueCounter[]>('/requests/queue/counters'),
    refetchInterval: 30_000,
  });

  const query = useMemo(() => toQueueQuery(f, page), [f, page]);
  const list = useQuery({
    queryKey: ['queue', query],
    queryFn: () => api.get<Paged<QueueItem>>('/requests/queue', query),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });

  // tick so waiting times stay fresh
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(i);
  }, []);

  const minWait = Number(f.minWaitHours);
  const items = (list.data?.items ?? []).filter((it) => {
    if (!minWait) return true;
    const h = waitingHours(it.step.activatedAt, now);
    return h !== null && h >= minWait;
  });

  const cs = counters.data ?? [];
  const totalCount = cs.reduce((s, c) => s + c.count, 0);
  const totalOverdue = cs.reduce((s, c) => s + c.overdue, 0);
  const roleName = (c: QueueCounter) => (locale === 'ar' ? c.nameAr : c.nameEn || c.nameAr);
  const stepName = (it: QueueItem) => (locale === 'ar' ? it.step.nameAr : it.step.nameEn || it.step.nameAr);
  const summary =
    totalCount === 0
      ? t('inbox.summaryNone')
      : totalOverdue > 0
        ? t('inbox.summary', { n: totalCount, o: totalOverdue })
        : t('inbox.summaryNoOverdue', { n: totalCount });
  const selectedCounter = cs.find((c) => c.roleId === f.roleId);
  const tabCount = counters.data ? (selectedCounter ? selectedCounter.count : totalCount) : undefined;

  const columns: Column<QueueItem>[] = [
    {
      key: 'request',
      header: t('requests.col.number'),
      primary: true,
      cell: (it) => (
        <span data-request-id={it.id} data-number={it.number}>
          <Code className="font-medium text-link">{it.number}</Code>
        </span>
      ),
    },
    {
      key: 'driver',
      header: t('requests.col.driver'),
      cell: (it) => (
        <span className="flex h-[60px] items-center gap-2">
          <Avatar name={it.submitterName} size={24} />
          <span className="flex flex-col">
            <span className="text-sm">{it.submitterName}</span>
            {!!it.summary?.vehicleNumber && <Code className="text-xs text-ink-3">{String(it.summary.vehicleNumber)}</Code>}
          </span>
        </span>
      ),
    },
    { key: 'total', header: t('requests.col.total'), align: 'end', cell: (it) => <Money value={it.totalFinal} /> },
    { key: 'step', header: t('requests.col.step'), cell: (it) => <span className="text-sm">{stepName(it)}</span> },
    { key: 'waiting', header: t('requests.col.waiting'), cell: (it) => <Waiting item={it} now={now} /> },
    { key: 'state', header: t('requests.col.status'), cell: (it) => <Flags item={it} /> },
    { key: 'go', header: '', width: 'w-10', cell: () => <Icon as={ChevronRight} mirror size={16} className="text-ink-disabled" /> },
  ];

  const nActive = activeFilterCount(f);
  const chips = (
    <>
      {(f.from || f.to) && (
        <FilterChip
          label={`${t('requests.filter.from')}: ${f.from ? toDisplay(f.from) : '…'} ${t('requests.filter.to')}: ${f.to ? toDisplay(f.to) : '…'}`}
          onRemove={() => setF((p) => ({ ...p, from: '', to: '' }))}
        />
      )}
      {f.submitterId && <FilterChip label={t('requests.filter.driver')} onRemove={() => set('submitterId', '')} />}
      {f.vehicleId && <FilterChip label={t('requests.filter.vehicle')} onRemove={() => set('vehicleId', '')} />}
      {f.minAmount && <FilterChip label={`${t('requests.filter.minAmount')}: ${f.minAmount}`} onRemove={() => set('minAmount', '')} />}
      {f.maxAmount && <FilterChip label={`${t('requests.filter.maxAmount')}: ${f.maxAmount}`} onRemove={() => set('maxAmount', '')} />}
      {f.minWaitHours && <FilterChip label={`${t('requests.filter.minWaitHours')}: ${f.minWaitHours}`} onRemove={() => set('minWaitHours', '')} />}
      {f.overdue && <FilterChip label={t('requests.filter.overdueOnly')} onRemove={() => set('overdue', false)} />}
    </>
  );

  return (
    <Page testId="page-inbox">
      <PageHeader title={t('requests.inbox.title')} subtitle={<span data-testid="inbox-summary">{summary}</span>} />

      {cs.length > 1 && (
        <div className="overflow-x-auto">
          <SegmentedControl
            size="md"
            ariaLabel={t('requests.inbox.counters')}
            value={f.roleId}
            onChange={(v) => set('roleId', v)}
            items={[
              { value: '', testId: 'inbox-role-all', label: <RoleLabel label={t('requests.inbox.allRoles')} count={totalCount} overdue={totalOverdue} /> },
              ...cs.map((c) => ({ value: c.roleId, testId: 'inbox-role-' + c.roleId, label: <RoleLabel label={roleName(c)} count={c.count} overdue={c.overdue} /> })),
            ]}
          />
        </div>
      )}

      <Tabs
        value={f.tab}
        onChange={(k) => set('tab', k as InboxFilters['tab'])}
        items={[
          { key: 'active', label: t('requests.inbox.tabActive'), count: tabCount },
          { key: 'awaiting', label: t('requests.inbox.tabAwaiting') },
        ]}
      />

      <FilterBar activeCount={nActive} onReset={() => setF({ ...EMPTY_INBOX_FILTERS, tab: f.tab, roleId: f.roleId })} chips={nActive > 0 ? chips : undefined}>
        <DateRange from={f.from} to={f.to} onChange={(v) => setF((p) => ({ ...p, ...v }))} />
        <FormField label={t('requests.filter.driver')} className="w-44">
          {(id) => <LookupSelect id={id} entity="submitters" value={f.submitterId} onChange={(v) => set('submitterId', v)} placeholder={t('requests.filter.any')} />}
        </FormField>
        <FormField label={t('requests.filter.vehicle')} className="w-44">
          {(id) => <LookupSelect id={id} entity="vehicles" value={f.vehicleId} onChange={(v) => set('vehicleId', v)} placeholder={t('requests.filter.any')} />}
        </FormField>
        <Popover
          align="start"
          className="w-72 space-y-3"
          trigger={
            <Button variant="secondary" data-testid="inbox-more-filters">
              {t('inbox.moreFilters')}
            </Button>
          }
        >
          <FormField label={t('requests.filter.minAmount')}>{(id) => <Input id={id} numeric value={f.minAmount} onChange={(e) => set('minAmount', e.target.value)} />}</FormField>
          <FormField label={t('requests.filter.maxAmount')}>{(id) => <Input id={id} numeric value={f.maxAmount} onChange={(e) => set('maxAmount', e.target.value)} />}</FormField>
          <FormField label={t('requests.filter.minWaitHours')}>
            {(id) => <Input id={id} numeric value={f.minWaitHours} onChange={(e) => set('minWaitHours', e.target.value.replace(/[^\d]/g, ''))} />}
          </FormField>
        </Popover>
        <Switch checked={f.overdue} onChange={(c) => set('overdue', c)} label={t('requests.filter.overdueOnly')} />
      </FilterBar>

      {list.isError && <ErrorBlock message={(list.error as Error).message} onRetry={() => void list.refetch()} />}
      {!list.isLoading && items.length === 0 ? (
        <div data-testid="inbox-empty">
          {f.tab === 'awaiting' ? (
            <EmptyState icon={<Icon as={MessageSquareWarning} size={24} />} title={t('inbox.emptyAwaiting')} />
          ) : (
            <EmptyState icon={<Icon as={CheckCheck} size={24} />} title={t('inbox.emptyTitle')} hint={t('inbox.emptyHint')} />
          )}
        </div>
      ) : (
        <DataTable
          testId="inbox"
          columns={columns}
          rows={list.isLoading ? undefined : items}
          rowKey={(it) => it.id}
          loading={list.isFetching}
          rowHref={(it) => `/requests/${it.id}`}
          rowTone={(it) => (it.step.overdue ? 'danger' : it.lock ? 'muted' : 'default')}
          page={list.data?.page ?? page}
          pageSize={list.data?.pageSize ?? INBOX_PAGE_SIZE}
          total={list.data?.total ?? 0}
          onPageChange={setPage}
          mobileCard={(it) => (
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <Code className="font-medium text-link">{it.number}</Code>
                <Money value={it.totalFinal} size="md" />
              </div>
              <div className="text-sm text-ink-2">
                {it.submitterName}
                {it.summary?.vehicleNumber ? (
                  <>
                    {' · '}
                    <Code>{String(it.summary.vehicleNumber)}</Code>
                  </>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-ink-2">{stepName(it)}</span>
                <Waiting item={it} now={now} />
                <Flags item={it} max={2} />
              </div>
            </div>
          )}
        />
      )}
    </Page>
  );
}

function RoleLabel({ label, count, overdue }: { label: string; count: number; overdue: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span>{label}</span>
      <span className="num text-xs text-brass-ink">{count}</span>
      {overdue > 0 && <span className="h-1.5 w-1.5 rounded-full bg-danger" aria-hidden />}
    </span>
  );
}

function Waiting({ item, now }: { item: QueueItem; now: number }) {
  const { locale } = useTr();
  const h = waitingHours(item.step.activatedAt, now);
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs', item.step.overdue ? 'font-medium text-danger' : 'text-ink-2')}>
      <Icon as={Clock} size={16} />
      <span className="num">{formatWaiting(h, locale)}</span>
    </span>
  );
}

function Flags({ item, max }: { item: QueueItem; max?: number }) {
  const { t } = useTr();
  const chips: JSX.Element[] = [];
  if (item.step.overdue) {
    chips.push(
      <Badge key="overdue" tone="red" icon={<Icon as={AlertTriangle} size={14} />}>
        {t('inbox.overdue')}
      </Badge>,
    );
  }
  if (item.lock) {
    chips.push(
      <Badge key="lock" tone="amber" icon={<Icon as={Lock} size={14} />}>
        {t('requests.lock.lockedBy', { name: item.lock.userName })}
      </Badge>,
    );
  }
  if (item.step.returnedFor) {
    chips.push(
      <Badge key="ret" tone="blue">
        {t('requests.inbox.returned', { name: item.step.returnedFor })}
      </Badge>,
    );
  }
  if (item.hasDuplicateWarning) {
    chips.push(
      <Badge key="dup" tone="red" icon={<Icon as={AlertTriangle} size={14} />}>
        {t('requests.inbox.duplicate')}
      </Badge>,
    );
  }
  if (item.status === 'CORRECTION_REQUESTED') {
    chips.push(
      <Badge key="corr" tone="amber">
        {t('requests.status.CORRECTION_REQUESTED')}
      </Badge>,
    );
  }
  return <span className="inline-flex flex-wrap items-center gap-1">{max ? chips.slice(0, max) : chips}</span>;
}
