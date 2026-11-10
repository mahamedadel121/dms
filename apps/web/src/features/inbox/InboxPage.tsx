'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { AlertTriangle, Clock, Lock } from 'lucide-react';
import { api } from '@/lib/api';
import { cairoDayToIso, formatEgp } from '@/lib/format';
import { cn } from '@/lib/cn';
import { Badge, Card, EmptyState, ErrorBlock, LoadingBlock, PageHeader, Tabs } from '@/components/ui/Display';
import { Button } from '@/components/ui/Button';
import { Checkbox, FormField, Input } from '@/components/ui/Fields';
import { useTr } from '../common/useTr';
import { LookupSelect } from '../common/lookups';
import { Pager } from '../common/Pager';
import { formatWaiting, waitingHours } from '../requests/helpers';
import type { Paged, QueueCounter, QueueItem } from '../types';

interface Filters {
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
const EMPTY: Filters = { tab: 'active', roleId: '', from: '', to: '', submitterId: '', vehicleId: '', minAmount: '', maxAmount: '', overdue: false, minWaitHours: '' };

export function InboxPage() {
  const { t, locale } = useTr();
  const [f, setF] = useState<Filters>(EMPTY);
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => {
    setF((p) => ({ ...p, [k]: v }));
    setPage(1);
  };

  const counters = useQuery({
    queryKey: ['queue-counters'],
    queryFn: () => api.get<QueueCounter[]>('/requests/queue/counters'),
    refetchInterval: 30_000,
  });

  const query = useMemo(
    () => ({
      tab: f.tab,
      roleId: f.roleId,
      from: f.from ? cairoDayToIso(f.from) : '',
      to: f.to ? cairoDayToIso(f.to, true) : '',
      submitterId: f.submitterId,
      vehicleId: f.vehicleId,
      minAmount: f.minAmount,
      maxAmount: f.maxAmount,
      overdue: f.overdue ? '1' : '',
      page,
      pageSize: 25,
    }),
    [f, page],
  );
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
  const totalCount = (counters.data ?? []).reduce((s, c) => s + c.count, 0);

  return (
    <div>
      <PageHeader title={t('requests.inbox.title')} subtitle={t('requests.inbox.subtitle')} />

      <div className="mb-4 flex flex-wrap gap-2" aria-label={t('requests.inbox.counters')}>
        <CounterChip active={f.roleId === ''} onClick={() => set('roleId', '')} label={t('requests.inbox.allRoles')} count={totalCount} />
        {(counters.data ?? []).map((c) => (
          <CounterChip
            key={c.roleId}
            active={f.roleId === c.roleId}
            onClick={() => set('roleId', f.roleId === c.roleId ? '' : c.roleId)}
            label={locale === 'ar' ? c.nameAr : c.nameEn || c.nameAr}
            count={c.count}
            overdue={c.overdue}
          />
        ))}
      </div>

      <Tabs
        className="mb-3"
        value={f.tab}
        onChange={(k) => set('tab', k as Filters['tab'])}
        items={[
          { key: 'active', label: t('requests.inbox.tabActive') },
          { key: 'awaiting', label: t('requests.inbox.tabAwaiting') },
        ]}
      />

      <Card className="mb-4" padded>
        <button type="button" className="mb-2 text-sm font-semibold text-brand-800 md:hidden" onClick={() => setShowFilters((s) => !s)}>
          {t('requests.inbox.filters')} {showFilters ? '▲' : '▼'}
        </button>
        <div className={cn('grid gap-3 sm:grid-cols-2 lg:grid-cols-4', showFilters ? '' : 'hidden md:grid')}>
          <FormField label={t('requests.filter.from')}>{(id) => <Input id={id} type="date" value={f.from} onChange={(e) => set('from', e.target.value)} />}</FormField>
          <FormField label={t('requests.filter.to')}>{(id) => <Input id={id} type="date" value={f.to} onChange={(e) => set('to', e.target.value)} />}</FormField>
          <FormField label={t('requests.filter.driver')}>
            {(id) => <LookupSelect id={id} entity="submitters" value={f.submitterId} onChange={(v) => set('submitterId', v)} placeholder={t('requests.filter.any')} />}
          </FormField>
          <FormField label={t('requests.filter.vehicle')}>
            {(id) => <LookupSelect id={id} entity="vehicles" value={f.vehicleId} onChange={(v) => set('vehicleId', v)} placeholder={t('requests.filter.any')} />}
          </FormField>
          <FormField label={t('requests.filter.minAmount')}>
            {(id) => <Input id={id} inputMode="decimal" value={f.minAmount} onChange={(e) => set('minAmount', e.target.value)} />}
          </FormField>
          <FormField label={t('requests.filter.maxAmount')}>
            {(id) => <Input id={id} inputMode="decimal" value={f.maxAmount} onChange={(e) => set('maxAmount', e.target.value)} />}
          </FormField>
          <FormField label={t('requests.filter.minWaitHours')}>
            {(id) => <Input id={id} inputMode="numeric" value={f.minWaitHours} onChange={(e) => set('minWaitHours', e.target.value.replace(/[^\d]/g, ''))} />}
          </FormField>
          <div className="flex items-end gap-3 pb-2">
            <Checkbox checked={f.overdue} onChange={(c) => set('overdue', c)} label={t('requests.filter.overdueOnly')} />
            <Button size="sm" variant="ghost" onClick={() => setF({ ...EMPTY, tab: f.tab })}>
              {t('common.reset')}
            </Button>
          </div>
        </div>
      </Card>

      {list.isError && <ErrorBlock message={(list.error as Error).message} />}
      {list.isLoading ? (
        <LoadingBlock />
      ) : items.length === 0 ? (
        <Card>
          <EmptyState title={t('requests.inbox.empty')} />
        </Card>
      ) : (
        <>
          {/* desktop table */}
          <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white md:block">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-start text-xs text-slate-500">
                <tr>
                  {['number', 'driver', 'vehicle', 'total', 'step', 'waiting', 'status'].map((k) => (
                    <th key={k} className="px-3 py-2 text-start font-semibold">
                      {t(`requests.col.${k}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((it) => (
                  <tr key={it.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2 font-semibold">
                      <Link href={`/requests/${it.id}`} className="text-brand-800 hover:underline">
                        {it.number}
                      </Link>
                    </td>
                    <td className="px-3 py-2">{it.submitterName}</td>
                    <td className="px-3 py-2 tabular-nums">{String(it.summary?.vehicleNumber ?? '')}</td>
                    <td className="px-3 py-2 tabular-nums">{formatEgp(it.totalFinal, locale)}</td>
                    <td className="px-3 py-2">{locale === 'ar' ? it.step.nameAr : it.step.nameEn || it.step.nameAr}</td>
                    <td className="px-3 py-2">
                      <Waiting item={it} now={now} />
                    </td>
                    <td className="px-3 py-2">
                      <Flags item={it} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* mobile cards */}
          <ul className="space-y-2 md:hidden">
            {items.map((it) => (
              <li key={it.id}>
                <Link href={`/requests/${it.id}`} className="block rounded-xl border border-slate-200 bg-white p-3 shadow-sm active:bg-slate-50">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-brand-800">{it.number}</span>
                    <span className="font-semibold tabular-nums">{formatEgp(it.totalFinal, locale)}</span>
                  </div>
                  <div className="mt-1 text-sm text-slate-700">
                    {it.submitterName} {it.summary?.vehicleNumber ? `· ${String(it.summary.vehicleNumber)}` : ''}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">{locale === 'ar' ? it.step.nameAr : it.step.nameEn || it.step.nameAr}</div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Waiting item={it} now={now} />
                    <Flags item={it} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          <Pager page={list.data?.page ?? page} pageSize={list.data?.pageSize ?? 25} total={list.data?.total ?? 0} onPage={setPage} />
        </>
      )}
    </div>
  );
}

function CounterChip({ label, count, overdue, active, onClick }: { label: string; count: number; overdue?: number; active: boolean; onClick: () => void }) {
  const { t } = useTr();
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors',
        active ? 'border-brand-700 bg-brand-700 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
      )}
    >
      <span>{label}</span>
      <span className={cn('rounded-full px-2 text-xs tabular-nums', active ? 'bg-white/20' : 'bg-slate-100')}>{count}</span>
      {!!overdue && (
        <span className="rounded-full bg-red-100 px-2 text-xs text-red-800" title={t('requests.inbox.overdue')}>
          {overdue}
        </span>
      )}
    </button>
  );
}

function Waiting({ item, now }: { item: QueueItem; now: number }) {
  const { t, locale } = useTr();
  const h = waitingHours(item.step.activatedAt, now);
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs', item.step.overdue ? 'font-semibold text-red-700' : 'text-slate-600')}>
      <Clock className="h-3.5 w-3.5" aria-hidden />
      {formatWaiting(h, locale)}
      {item.step.overdue && <span>· {t('requests.inbox.overdue')}</span>}
    </span>
  );
}

function Flags({ item }: { item: QueueItem }) {
  const { t } = useTr();
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {item.lock && (
        <Badge tone="amber" className="gap-1">
          <Lock className="h-3 w-3" aria-hidden />
          {t('requests.lock.beingReviewedBy', { name: item.lock.userName })}
        </Badge>
      )}
      {item.step.returnedFor && <Badge tone="blue">{t('requests.inbox.returned', { name: item.step.returnedFor })}</Badge>}
      {item.hasDuplicateWarning && (
        <Badge tone="red" className="gap-1">
          <AlertTriangle className="h-3 w-3" aria-hidden />
          {t('requests.inbox.duplicate')}
        </Badge>
      )}
      {item.status === 'CORRECTION_REQUESTED' && <Badge tone="amber">{t('requests.status.CORRECTION_REQUESTED')}</Badge>}
    </span>
  );
}
