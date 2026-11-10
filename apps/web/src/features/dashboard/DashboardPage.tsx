'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { cairoDayToIso, formatEgp, formatNumber } from '@/lib/format';
import { Card, EmptyState, ErrorBlock, LoadingBlock, PageHeader } from '@/components/ui/Display';
import { DateRange } from '@/components/ui/Inputs2';
import { useTr } from '../common/useTr';
import type { DashboardSummaryDto, DelayedItemDto } from '../types';

export function DashboardPage() {
  const { t, locale } = useTr();
  const [range, setRange] = useState({ from: '', to: '' });
  const query = useMemo(() => ({ from: range.from ? cairoDayToIso(range.from) : '', to: range.to ? cairoDayToIso(range.to, true) : '' }), [range]);
  const q = useQuery({ queryKey: ['dashboard', query], queryFn: () => api.get<DashboardSummaryDto>('/dashboard/summary', query) });
  const delayed = useQuery({ queryKey: ['dashboard-delayed'], queryFn: () => api.get<DelayedItemDto[]>('/dashboard/delayed'), refetchInterval: 60_000 });
  const d = q.data;
  const nm = (o: { nameAr: string; nameEn: string }) => (locale === 'ar' ? o.nameAr : o.nameEn || o.nameAr);

  return (
    <div className="space-y-4">
      <PageHeader title={t('dashboard.title')} subtitle={t('dashboard.subtitle')} actions={<DateRange from={range.from} to={range.to} onChange={setRange} />} />
      {q.isError && <ErrorBlock message={errorMessage(q.error)} />}
      {q.isLoading || !d ? (
        <LoadingBlock />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label={t('dashboard.kpi.requests')} value={formatNumber(d.totals.count, 0)} />
            <Kpi label={t('dashboard.kpi.finalTotal')} value={formatEgp(d.totals.finalTotal, locale)} />
            <Kpi label={t('dashboard.kpi.originalTotal')} value={formatEgp(d.totals.originalTotal, locale)} />
            <Kpi
              label={t('dashboard.kpi.delayed')}
              value={formatNumber(d.delayedByRole.reduce((s, r) => s + r.count, 0), 0)}
              tone={d.delayedByRole.some((r) => r.count > 0) ? 'red' : undefined}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title={t('dashboard.byPeriod')}>
              <Bars rows={d.byPeriod.map((p) => ({ key: p.period, label: p.period, value: Number(p.total), sub: `${p.count}` }))} />
            </Card>
            <Card title={t('dashboard.byExpenseType')}>
              <Bars rows={d.byExpenseType.map((p) => ({ key: p.categoryId, label: nm(p), value: Number(p.total), sub: `${p.count}` }))} />
            </Card>
            <Card title={t('dashboard.topVehicles')}>
              <Bars rows={d.topVehicles.map((p) => ({ key: p.vehicleId, label: p.vehicleNumber, value: Number(p.total), sub: `${p.count}` }))} />
            </Card>
            <Card title={t('dashboard.byVehicle')}>
              <Bars rows={d.byVehicle.slice(0, 15).map((p) => ({ key: p.vehicleId, label: p.vehicleNumber, value: Number(p.total), sub: `${p.count}` }))} />
            </Card>
            <Card title={t('dashboard.avgApproval')}>
              <Bars
                money={false}
                rows={d.avgApprovalHoursByStep.map((p) => ({ key: p.stepKey, label: nm(p), value: p.avgHours, sub: t('dashboard.hoursSub', { n: p.count }) }))}
                unit={t('dashboard.hoursUnit')}
              />
            </Card>
            <Card title={t('dashboard.delayedByRole')}>
              <Bars money={false} tone="red" rows={d.delayedByRole.map((p) => ({ key: p.roleId, label: nm(p), value: p.count }))} />
            </Card>
          </div>
        </>
      )}

      <Card title={t('dashboard.delayedList')} padded={false}>
        {delayed.isLoading ? (
          <LoadingBlock />
        ) : (delayed.data ?? []).length === 0 ? (
          <EmptyState title={t('dashboard.noDelayed')} />
        ) : (
          <ul className="divide-y divide-slate-100">
            {(delayed.data ?? []).map((it) => (
              <li key={it.stepInstanceId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
                <Link href={`/requests/${it.requestId}`} className="font-semibold text-brand-800 hover:underline">
                  {it.requestNumber}
                </Link>
                <span className="text-slate-600">{it.submitterName}</span>
                <span>{locale === 'ar' ? it.stepNameAr : it.stepNameEn || it.stepNameAr}</span>
                <span className="text-slate-500">{locale === 'ar' ? it.roleNameAr : it.roleNameEn || it.roleNameAr}</span>
                <span className="font-semibold text-red-700 tabular-nums">{t('dashboard.overdueHours', { n: Math.round(it.overdueHours) })}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: 'red' }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums sm:text-2xl ${tone === 'red' ? 'text-red-700' : 'text-slate-900'}`}>{value}</p>
    </div>
  );
}

/** Horizontal CSS bar list (no chart dependency). */
function Bars({ rows, money = true, tone, unit }: { rows: { key: string; label: string; value: number; sub?: string }[]; money?: boolean; tone?: 'red'; unit?: string }) {
  const { locale } = useTr();
  if (rows.length === 0) return <EmptyState />;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="truncate">{r.label}</span>
            <span className="shrink-0 font-semibold tabular-nums">
              {money ? formatEgp(String(r.value), locale) : `${formatNumber(r.value, r.value % 1 ? 1 : 0)}${unit ? ` ${unit}` : ''}`}
              {r.sub && <span className="ms-2 text-xs font-normal text-slate-400">({r.sub})</span>}
            </span>
          </div>
          <div className="mt-0.5 h-2 overflow-hidden rounded-full bg-slate-100" role="presentation">
            <div className={`h-full rounded-full ${tone === 'red' ? 'bg-red-500' : 'bg-brand-600'}`} style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
