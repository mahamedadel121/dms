'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCheck } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { cairoDayToIso, formatNumber, formatPercent } from '@/lib/format';
import { Badge, Card, Code, DataTable, DateText, EmptyState, ErrorBlock, Icon, Money, Num, Page, PageHeader, Stat, type Column } from '@/components/ui';
import { BarList } from '@/components/charts/BarList';
import { ColumnChart } from '@/components/charts/ColumnChart';
import { topWithOther } from '@/components/charts/chartModel';
import { useTr } from '../common/useTr';
import type { DashboardSummaryDto, DelayedItemDto } from '../types';
import { DateRange } from '@/components/ui/Inputs2';

export function DashboardPage() {
  const { t, locale } = useTr();
  const [range, setRange] = useState({ from: '', to: '' });
  const [role, setRole] = useState<string | null>(null);
  const query = useMemo(() => ({ from: range.from ? cairoDayToIso(range.from) : '', to: range.to ? cairoDayToIso(range.to, true) : '' }), [range]);
  const q = useQuery({ queryKey: ['dashboard', query], queryFn: () => api.get<DashboardSummaryDto>('/dashboard/summary', query) });
  const delayed = useQuery({ queryKey: ['dashboard-delayed'], queryFn: () => api.get<DelayedItemDto[]>('/dashboard/delayed'), refetchInterval: 60_000 });
  const d = q.data;
  const nm = (o: { nameAr: string; nameEn: string }) => (locale === 'ar' ? o.nameAr : o.nameEn || o.nameAr);

  const overdue = d ? d.delayedByRole.reduce((s, r) => s + r.count, 0) : 0;
  const original = d ? Number(d.totals.originalTotal) : 0;
  const final = d ? Number(d.totals.finalTotal) : 0;
  const diff = original - final;
  const diffRatio = original > 0 ? diff / original : 0;

  const types = d ? topWithOther(d.byExpenseType, 6, (r) => Number(r.total)) : null;
  const typeRows = types
    ? [
        ...types.top.map((r) => ({ key: r.categoryId, label: nm(r), value: Number(r.total), valueLabel: <Money value={r.total} />, caption: <Num value={r.count} /> })),
        ...(types.otherCount > 0 ? [{ key: '__other', label: t('dashboard.other', { n: types.otherCount }), value: types.otherTotal, valueLabel: <Money value={types.otherTotal} /> }] : []),
      ]
    : [];
  const timings = d?.avgApprovalHoursByStep ?? [];

  const delayedRows = (delayed.data ?? []).filter((it) => !role || it.roleId === role);
  const columns: Column<DelayedItemDto>[] = [
    {
      key: 'requestNumber',
      header: t('dashboard.col.number'),
      primary: true,
      cell: (r) => (
        <Link href={`/requests/${r.requestId}`} className="text-primary hover:underline">
          <Code>{r.requestNumber}</Code>
        </Link>
      ),
    },
    { key: 'submitterName', header: t('dashboard.col.driver'), cell: (r) => r.submitterName ?? '' },
    { key: 'step', header: t('dashboard.col.step'), cell: (r) => (locale === 'ar' ? r.stepNameAr : r.stepNameEn || r.stepNameAr) },
    { key: 'since', header: t('dashboard.col.since'), cell: (r) => <DateText value={r.activatedAt ?? r.dueAt} mode="relative" /> },
    { key: 'overdue', header: t('dashboard.col.overdue'), align: 'end', cell: (r) => <span className="num text-danger">{t('dashboard.hoursValue', { n: formatNumber(r.overdueHours, 0) })}</span> },
  ];

  return (
    <Page testId="page-dashboard" width="wide">
      <PageHeader
        title={t('dashboard.title')}
        subtitle={t('dashboard.subtitle')}
        actions={
          <div data-testid="dash-range">
            <DateRange from={range.from} to={range.to} onChange={setRange} />
          </div>
        }
      />
      {q.isError && <ErrorBlock message={errorMessage(q.error)} onRetry={() => void q.refetch()} />}

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <div className="col-span-2 xl:col-span-1">
          <Stat
            accent
            testId="kpi-total"
            loading={!d}
            label={t('dashboard.kpi.total')}
            value={<Money value={d?.totals.finalTotal} size="hero" />}
            caption={
              d && diff !== 0 ? (
                <span>
                  {t('dashboard.kpi.before')} <Money value={d.totals.originalTotal} size="sm" muted />
                </span>
              ) : undefined
            }
          />
        </div>
        <Stat testId="kpi-count" loading={!d} label={t('dashboard.kpi.lines')} value={<Num value={d?.totals.count} />} />
        <Stat
          testId="kpi-diff"
          loading={!d}
          label={t('dashboard.kpi.diff')}
          value={<Money value={diff.toFixed(2)} size="lg" />}
          delta={d ? { text: formatPercent(diffRatio), tone: diff > 0 ? 'good' : 'neutral' } : undefined}
        />
        <Stat
          testId="kpi-overdue"
          loading={!d}
          label={t('dashboard.kpi.overdue')}
          value={<Num value={overdue} />}
          tone={overdue > 0 ? 'danger' : 'default'}
          caption={overdue === 0 ? t('dashboard.kpi.noDelay') : undefined}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-12">
        <div className="xl:col-span-8" data-testid="chart-by-month">
          <Card title={t('dashboard.byMonth')} className="h-full">
            {d && d.byPeriod.length > 0 ? <ColumnChart data={d.byPeriod} /> : <EmptyState compact />}
          </Card>
        </div>
        <div className="xl:col-span-4" data-testid="chart-by-type">
          <Card title={t('dashboard.byType')} className="h-full">
            {typeRows.length > 0 ? <BarList rows={typeRows} /> : <EmptyState compact />}
          </Card>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div data-testid="chart-top-vehicles">
          <Card title={t('dashboard.topVehicles')} className="h-full">
            {d && d.topVehicles.length > 0 ? (
              <BarList
                tone="brass"
                rows={d.topVehicles.map((r) => ({ key: r.vehicleId, label: <Code>{r.vehicleNumber}</Code>, value: Number(r.total), valueLabel: <Money value={r.total} />, caption: <Num value={r.count} /> }))}
              />
            ) : (
              <EmptyState compact />
            )}
          </Card>
        </div>
        <div data-testid="chart-avg-hours">
          <Card title={t('dashboard.avgApproval')} className="h-full">
            {timings.length === 0 || timings.every((r) => r.avgHours === 0) ? (
              <EmptyState compact title={t('dashboard.noTimings')} />
            ) : (
              <BarList
                rows={timings.map((r) => ({
                  key: r.stepKey,
                  label: nm(r),
                  value: r.avgHours,
                  valueLabel: `${formatNumber(r.avgHours, 1)} ${t('dashboard.hoursShort')}`,
                  caption: t('dashboard.hoursSub', { n: r.count }),
                }))}
              />
            )}
          </Card>
        </div>
      </div>

      <div data-testid="delayed-table">
        <Card title={t('dashboard.delayed')}>
          {d && d.delayedByRole.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-2">
              {d.delayedByRole.map((r) => (
                <button key={r.roleId} type="button" aria-pressed={role === r.roleId} onClick={() => setRole(role === r.roleId ? null : r.roleId)}>
                  <Badge tone={role === r.roleId ? 'navy' : 'red'}>
                    {nm(r)} <Num value={r.count} />
                  </Badge>
                </button>
              ))}
            </div>
          )}
          {delayed.isLoading || delayedRows.length > 0 ? (
            <DataTable testId="delayed" columns={columns} rows={delayedRows} loading={delayed.isLoading} rowKey={(r) => r.stepInstanceId} />
          ) : (
            <EmptyState compact icon={<Icon as={CheckCheck} size={24} />} title={t('dashboard.noDelayed')} />
          )}
        </Card>
      </div>
    </Page>
  );
}
