'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FileArchive, FileSpreadsheet, FileText, Play } from 'lucide-react';
import { EXPORT_KINDS, REPORT_DATE_FIELDS, REPORT_GROUP_BY, type ReportFiltersDto } from '@dms/shared';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDateTime, formatEgp, formatNumber } from '@/lib/format';
import { Badge, Card, ErrorBlock, PageHeader } from '@/components/ui/Display';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Button } from '@/components/ui/Button';
import { Checkbox, FormField, Input, Select } from '@/components/ui/Fields';
import { DateRange, LookupSelect } from '@/components/ui/Inputs2';
import { useToast } from '@/components/ui/Toast';
import { useTr } from '../common/useTr';
import type { ExportInfoDto, ReportResultDto, ReportRowDto } from '../types';

const STATUSES = ['IN_REVIEW', 'CORRECTION_REQUESTED', 'APPROVED', 'PAID', 'REJECTED'] as const;
type Status = (typeof STATUSES)[number];

interface FormState {
  dateField: (typeof REPORT_DATE_FIELDS)[number];
  from: string;
  to: string;
  submitterId: string;
  vehicleId: string;
  vehicleTypeId: string;
  costCenterId: string;
  categoryId: string;
  glAccountId: string;
  stepRoleId: string;
  statuses: Status[];
  number: string;
  minAmount: string;
  maxAmount: string;
  groupBy: '' | (typeof REPORT_GROUP_BY)[number];
}
const EMPTY: FormState = {
  dateField: 'submittedAt',
  from: '',
  to: '',
  submitterId: '',
  vehicleId: '',
  vehicleTypeId: '',
  costCenterId: '',
  categoryId: '',
  glAccountId: '',
  stepRoleId: '',
  statuses: [],
  number: '',
  minAmount: '',
  maxAmount: '',
  groupBy: '',
};

const one = (v: string) => (v ? [v] : undefined);
export function toFilters(s: FormState): ReportFiltersDto {
  return {
    dateField: s.dateField,
    from: s.from || undefined,
    to: s.to || undefined,
    submitterIds: one(s.submitterId),
    vehicleIds: one(s.vehicleId),
    vehicleTypeIds: one(s.vehicleTypeId),
    costCenterIds: one(s.costCenterId),
    categoryIds: one(s.categoryId),
    glAccountIds: one(s.glAccountId),
    stepRoleIds: one(s.stepRoleId),
    statuses: s.statuses.length ? s.statuses : undefined,
    number: s.number.trim() || undefined,
    minAmount: s.minAmount.trim() || undefined,
    maxAmount: s.maxAmount.trim() || undefined,
  };
}

export function ReportsPage() {
  const { t, locale } = useTr();
  const { can } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [applied, setApplied] = useState<FormState | null>(null);
  const [page, setPage] = useState(1);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((p) => ({ ...p, [k]: v }));

  const body = useMemo(() => (applied ? { filters: toFilters(applied), groupBy: applied.groupBy || undefined, page, pageSize: 50 } : null), [applied, page]);
  const result = useQuery({
    queryKey: ['report', body],
    enabled: !!body,
    queryFn: () => api.post<ReportResultDto>('/reports/query', body),
    placeholderData: keepPreviousData,
  });

  const exports = useQuery({
    queryKey: ['report-exports'],
    queryFn: () => api.get<ExportInfoDto[] | { items: ExportInfoDto[] }>('/reports/exports').then((r) => (Array.isArray(r) ? r : r.items)),
    refetchInterval: (q) => ((q.state.data ?? []).some((e) => e.status === 'QUEUED' || e.status === 'RUNNING') ? 3000 : false),
  });
  const startExport = useMutation({
    mutationFn: (kind: (typeof EXPORT_KINDS)[number]) =>
      api.post<{ exportId: string }>('/reports/exports', { kind, filters: toFilters(applied ?? form), groupBy: (applied ?? form).groupBy || undefined }),
    onSuccess: () => {
      toast.success(t('reports.exportQueued'));
      void qc.invalidateQueries({ queryKey: ['report-exports'] });
    },
    onError: (e) => toast.error(e),
  });
  const download = async (e: ExportInfoDto) => {
    try {
      const fresh = await api.get<ExportInfoDto>(`/reports/exports/${e.id}`);
      if (fresh.downloadUrl) window.open(fresh.downloadUrl, '_blank', 'noopener');
      else toast.error(t('reports.expired'));
    } catch (err) {
      toast.error(err);
    }
  };

  const columns: Column<ReportRowDto>[] = [
    {
      key: 'requestNumber',
      header: t('reports.col.number'),
      primary: true,
      cell: (r) => (
        <Link href={r.link || `/requests/${r.requestId}`} className="font-semibold text-brand-800 hover:underline" onClick={(e) => e.stopPropagation()}>
          {r.requestNumber}
        </Link>
      ),
    },
    { key: 'submittedAt', header: t('reports.col.submittedAt'), cell: (r) => formatDateTime(r.submittedAt) },
    { key: 'paidAt', header: t('reports.col.paidAt'), cell: (r) => (r.paidAt ? formatDateTime(r.paidAt) : '') },
    { key: 'driverName', header: t('reports.col.driver') },
    { key: 'vehicleNumber', header: t('reports.col.vehicle') },
    { key: 'costCenterCode', header: t('reports.col.costCenter') },
    { key: 'expenseType', header: t('reports.col.expenseType'), cell: (r) => (locale === 'ar' ? r.expenseTypeAr : r.expenseTypeEn || r.expenseTypeAr) },
    { key: 'gl', header: t('reports.col.gl'), cell: (r) => r.glNumber ?? '' },
    { key: 'originalAmount', header: t('reports.col.original'), cell: (r) => <span className="tabular-nums">{formatNumber(r.originalAmount)}</span> },
    { key: 'finalAmount', header: t('reports.col.final'), cell: (r) => <span className={`tabular-nums ${r.originalAmount !== r.finalAmount ? 'font-bold text-purple-800' : ''}`}>{formatNumber(r.finalAmount)}</span> },
    { key: 'liters', header: t('reports.col.liters'), cell: (r) => (r.liters ? formatNumber(r.liters) : '') },
    { key: 'pricePerLiter', header: t('reports.col.ppl'), cell: (r) => (r.pricePerLiter ? formatNumber(r.pricePerLiter) : '') },
    { key: 'odometer', header: t('reports.col.odometer') },
    {
      key: 'approvers',
      header: t('reports.col.approvers'),
      cell: (r) => (
        <span className="text-xs">
          {r.approvers
            .filter((a) => a.userName)
            .map((a) => `${locale === 'ar' ? a.roleNameAr : a.roleNameEn || a.roleNameAr}: ${a.userName}`)
            .join(' · ')}
        </span>
      ),
    },
    { key: 'sapDocNumber', header: t('reports.col.sap') },
    { key: 'imageCount', header: t('reports.col.images') },
  ];

  const canExport = can('reports.export');
  const data = result.data;

  return (
    <div className="space-y-4">
      <PageHeader title={t('reports.title')} subtitle={t('reports.subtitle')} />

      <Card title={t('reports.filters')}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <FormField label={t('reports.dateField')}>
            {(id) => <Select id={id} value={form.dateField} onChange={(v) => set('dateField', v as FormState['dateField'])} options={REPORT_DATE_FIELDS.map((d) => ({ value: d, label: t(`reports.dateField.${d}`) }))} />}
          </FormField>
          <FormField label={t('reports.dateRange')} className="sm:col-span-2">
            {() => <DateRange from={form.from} to={form.to} onChange={(v) => setForm((p) => ({ ...p, ...v }))} />}
          </FormField>
          <FormField label={t('reports.col.number')}>{(id) => <Input id={id} value={form.number} onChange={(e) => set('number', e.target.value)} />}</FormField>
          <FormField label={t('reports.col.driver')}>{(id) => <LookupSelect id={id} entity="submitters" value={form.submitterId} onChange={(v) => set('submitterId', v)} placeholder={t('requests.filter.any')} />}</FormField>
          <FormField label={t('reports.col.vehicle')}>{(id) => <LookupSelect id={id} entity="vehicles" value={form.vehicleId} onChange={(v) => set('vehicleId', v)} placeholder={t('requests.filter.any')} />}</FormField>
          <FormField label={t('reports.vehicleType')}>{(id) => <LookupSelect id={id} entity="vehicle-types" value={form.vehicleTypeId} onChange={(v) => set('vehicleTypeId', v)} placeholder={t('requests.filter.any')} />}</FormField>
          <FormField label={t('reports.col.costCenter')}>{(id) => <LookupSelect id={id} entity="cost-centers" value={form.costCenterId} onChange={(v) => set('costCenterId', v)} placeholder={t('requests.filter.any')} />}</FormField>
          <FormField label={t('reports.col.expenseType')}>{(id) => <LookupSelect id={id} entity="expense-types" value={form.categoryId} onChange={(v) => set('categoryId', v)} placeholder={t('requests.filter.any')} />}</FormField>
          <FormField label={t('reports.col.gl')}>{(id) => <LookupSelect id={id} entity="gl-accounts" value={form.glAccountId} onChange={(v) => set('glAccountId', v)} placeholder={t('requests.filter.any')} />}</FormField>
          <FormField label={t('reports.stepRole')}>{(id) => <LookupSelect id={id} entity="roles" value={form.stepRoleId} onChange={(v) => set('stepRoleId', v)} placeholder={t('requests.filter.any')} />}</FormField>
          <FormField label={t('requests.filter.minAmount')}>{(id) => <Input id={id} inputMode="decimal" value={form.minAmount} onChange={(e) => set('minAmount', e.target.value)} />}</FormField>
          <FormField label={t('requests.filter.maxAmount')}>{(id) => <Input id={id} inputMode="decimal" value={form.maxAmount} onChange={(e) => set('maxAmount', e.target.value)} />}</FormField>
          <FormField label={t('reports.groupBy')}>
            {(id) => <Select id={id} value={form.groupBy} onChange={(v) => set('groupBy', v as FormState['groupBy'])} placeholder={t('reports.noGroup')} options={REPORT_GROUP_BY.map((g) => ({ value: g, label: t(`reports.group.${g}`) }))} />}
          </FormField>
        </div>
        <fieldset className="mt-3">
          <legend className="mb-1 text-sm font-semibold text-slate-700">{t('reports.statuses')}</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {STATUSES.map((s) => (
              <Checkbox key={s} checked={form.statuses.includes(s)} onChange={(v) => set('statuses', v ? [...form.statuses, s] : form.statuses.filter((x) => x !== s))} label={t(`requests.status.${s}`)} />
            ))}
          </div>
        </fieldset>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            icon={<Play className="h-4 w-4" />}
            loading={result.isFetching}
            onClick={() => {
              setPage(1);
              setApplied(form);
            }}
          >
            {t('reports.run')}
          </Button>
          <Button variant="ghost" onClick={() => { setForm(EMPTY); setApplied(null); }}>
            {t('common.reset')}
          </Button>
          {canExport && (
            <>
              <Button variant="secondary" icon={<FileSpreadsheet className="h-4 w-4" />} loading={startExport.isPending && startExport.variables === 'EXCEL'} onClick={() => startExport.mutate('EXCEL')}>
                {t('reports.export.EXCEL')}
              </Button>
              {can('reports.export_images') && (
                <Button variant="secondary" icon={<FileArchive className="h-4 w-4" />} loading={startExport.isPending && startExport.variables === 'ZIP_IMAGES'} onClick={() => startExport.mutate('ZIP_IMAGES')}>
                  {t('reports.export.ZIP_IMAGES')}
                </Button>
              )}
              <Button variant="secondary" icon={<FileText className="h-4 w-4" />} loading={startExport.isPending && startExport.variables === 'PDF_BUNDLE'} onClick={() => startExport.mutate('PDF_BUNDLE')}>
                {t('reports.export.PDF_BUNDLE')}
              </Button>
            </>
          )}
        </div>
      </Card>

      {result.isError && <ErrorBlock message={errorMessage(result.error)} />}

      {data && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Stat label={t('reports.totals.count')} value={formatNumber(data.totals.count, 0)} />
            <Stat label={t('reports.totals.original')} value={formatEgp(data.totals.originalTotal, locale)} />
            <Stat label={t('reports.totals.final')} value={formatEgp(data.totals.finalTotal, locale)} />
          </div>
          {data.groups && (
            <Card title={t('reports.groups')} padded={false}>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-500">
                    <tr>
                      <th className="px-3 py-2 text-start">{t(`reports.group.${applied?.groupBy || 'driver'}`)}</th>
                      <th className="px-3 py-2 text-start">{t('reports.totals.count')}</th>
                      <th className="px-3 py-2 text-start">{t('reports.totals.original')}</th>
                      <th className="px-3 py-2 text-start">{t('reports.totals.final')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.groups.map((g) => (
                      <tr key={g.key}>
                        <td className="px-3 py-2 font-semibold">{g.label}</td>
                        <td className="px-3 py-2 tabular-nums">{g.count}</td>
                        <td className="px-3 py-2 tabular-nums">{formatNumber(g.originalTotal)}</td>
                        <td className="px-3 py-2 font-semibold tabular-nums">{formatNumber(g.finalTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
          <Card title={t('reports.rows')} padded={false}>
            <DataTable columns={columns} rows={data.rows} rowKey={(r) => r.lineId} loading={result.isFetching} page={data.page} pageSize={data.pageSize} total={data.totals.count} onPageChange={setPage} />
          </Card>
        </>
      )}

      <Card title={t('reports.exports')} padded={false}>
        {(exports.data ?? []).length === 0 ? (
          <p className="p-4 text-sm text-slate-500">{t('reports.noExports')}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {(exports.data ?? []).map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-3 px-4 py-2 text-sm">
                <Badge tone="blue">{t(`reports.export.${e.kind}`)}</Badge>
                <Badge tone={e.status === 'DONE' ? 'green' : e.status === 'FAILED' ? 'red' : e.status === 'EXPIRED' ? 'gray' : 'amber'}>{t(`reports.exportStatus.${e.status}`)}</Badge>
                <span className="flex-1 truncate text-slate-600">{e.fileName ?? ''}</span>
                <span className="text-xs text-slate-500">{formatDateTime(e.createdAt)}</span>
                {e.error && <span className="text-xs text-red-700">{e.error}</span>}
                {e.status === 'DONE' && (
                  <Button size="sm" variant="secondary" icon={<Download className="h-4 w-4" />} onClick={() => void download(e)}>
                    {t('common.download')}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-0.5 text-base font-bold tabular-nums sm:text-lg">{value}</p>
    </div>
  );
}
