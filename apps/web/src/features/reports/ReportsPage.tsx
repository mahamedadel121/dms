'use client';

import Link from 'next/link';
import { useMemo, useState, type ReactNode } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FileArchive, FileSpreadsheet, FileText, Filter, Play } from 'lucide-react';
import { EXPORT_KINDS, REPORT_DATE_FIELDS, REPORT_GROUP_BY, type ReportFiltersDto } from '@dms/shared';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useIsDesktop } from '@/lib/useMediaQuery';
import { Button, Card, Checkbox, Code, DataTable, DateText, Drawer, ErrorBlock, FormField, Icon, Input, Menu, Money, Num, Page, PageHeader, Rule, Select, Stat, StatusChip, useToast, type Column, type MenuItem } from '@/components/ui';
import { DateRange, LookupSelect } from '@/components/ui/Inputs2';
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

function sizeText(bytes: number | null): ReactNode {
  if (bytes === null) return '';
  if (bytes < 1024) return <Num value={bytes} />;
  if (bytes < 1024 * 1024) return <span><Num value={bytes / 1024} decimals={1} /> KB</span>;
  return <span><Num value={bytes / (1024 * 1024)} decimals={1} /> MB</span>;
}

export function ReportsPage() {
  const { t, locale } = useTr();
  const { can } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const desktop = useIsDesktop();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [applied, setApplied] = useState<FormState | null>(null);
  const [page, setPage] = useState(1);
  const [drawer, setDrawer] = useState(false);
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

  const run = () => {
    setPage(1);
    setApplied(form);
    setDrawer(false);
  };
  const reset = () => {
    setForm(EMPTY);
    setApplied(null);
  };

  const columns: Column<ReportRowDto>[] = [
    {
      key: 'requestNumber',
      header: t('reports.col.number'),
      primary: true,
      className: 'sticky start-0 bg-surface',
      cell: (r) => (
        <Link href={r.link || `/requests/${r.requestId}`} className="text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
          <Code>{r.requestNumber}</Code>
        </Link>
      ),
    },
    { key: 'submittedAt', header: t('reports.col.submittedAt'), cell: (r) => <DateText value={r.submittedAt} mode="dayTime" /> },
    { key: 'paidAt', header: t('reports.col.paidAt'), cell: (r) => (r.paidAt ? <DateText value={r.paidAt} mode="dayTime" /> : '') },
    { key: 'driverName', header: t('reports.col.driver') },
    { key: 'vehicleNumber', header: t('reports.col.vehicle'), cell: (r) => <Code>{r.vehicleNumber}</Code> },
    { key: 'costCenterCode', header: t('reports.col.costCenter'), cell: (r) => (r.costCenterCode ? <Code>{r.costCenterCode}</Code> : '') },
    { key: 'expenseType', header: t('reports.col.expenseType'), cell: (r) => (locale === 'ar' ? r.expenseTypeAr : r.expenseTypeEn || r.expenseTypeAr) },
    { key: 'gl', header: t('reports.col.gl'), cell: (r) => (r.glNumber ? <Code>{r.glNumber}</Code> : '') },
    { key: 'originalAmount', header: t('reports.col.original'), align: 'end', cell: (r) => <Money value={r.originalAmount} muted /> },
    { key: 'finalAmount', header: t('reports.col.final'), align: 'end', cell: (r) => <Money value={r.finalAmount} original={r.originalAmount} /> },
    { key: 'liters', header: t('reports.col.liters'), align: 'end', cell: (r) => (r.liters ? <Num value={r.liters} decimals={2} /> : '') },
    { key: 'pricePerLiter', header: t('reports.col.ppl'), align: 'end', cell: (r) => (r.pricePerLiter ? <Num value={r.pricePerLiter} decimals={2} /> : '') },
    { key: 'odometer', header: t('reports.col.odometer'), align: 'end', cell: (r) => (r.odometer ? <Num value={r.odometer} /> : '') },
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
    { key: 'sapDocNumber', header: t('reports.col.sap'), cell: (r) => (r.sapDocNumber ? <Code>{r.sapDocNumber}</Code> : '') },
    { key: 'imageCount', header: t('reports.col.images'), align: 'end', cell: (r) => <Num value={r.imageCount} /> },
  ];

  const canExport = can('reports.export');
  const data = result.data;
  const any = t('requests.filter.any');

  const exportItems: MenuItem[] = [
    { key: 'EXCEL', label: t('reports.export.EXCEL'), icon: <Icon as={FileSpreadsheet} size={16} />, onSelect: () => startExport.mutate('EXCEL'), testId: 'report-export-EXCEL' },
    { key: 'ZIP_IMAGES', label: t('reports.export.ZIP_IMAGES'), icon: <Icon as={FileArchive} size={16} />, hidden: !can('reports.export_images'), onSelect: () => startExport.mutate('ZIP_IMAGES'), testId: 'report-export-ZIP_IMAGES' },
    { key: 'PDF_BUNDLE', label: t('reports.export.PDF_BUNDLE'), icon: <Icon as={FileText} size={16} />, onSelect: () => startExport.mutate('PDF_BUNDLE'), testId: 'report-export-PDF_BUNDLE' },
  ];

  const filters = (
    <div className="space-y-4">
      <section className="space-y-3">
        <h4 className="text-13 font-semibold text-ink-2">{t('reports.section.period')}</h4>
        <FormField label={t('reports.dateField')}>
          {(id) => <Select id={id} value={form.dateField} onChange={(v) => set('dateField', v as FormState['dateField'])} options={REPORT_DATE_FIELDS.map((d) => ({ value: d, label: t(`reports.dateField.${d}`) }))} />}
        </FormField>
        <FormField label={t('reports.dateRange')}>{() => <DateRange from={form.from} to={form.to} onChange={(v) => setForm((p) => ({ ...p, ...v }))} />}</FormField>
      </section>
      <Rule variant="hairline" />
      <section className="space-y-3">
        <h4 className="text-13 font-semibold text-ink-2">{t('reports.section.who')}</h4>
        <FormField label={t('reports.col.driver')}>{(id) => <LookupSelect id={id} entity="submitters" value={form.submitterId} onChange={(v) => set('submitterId', v)} placeholder={any} />}</FormField>
        <FormField label={t('reports.col.vehicle')}>{(id) => <LookupSelect id={id} entity="vehicles" value={form.vehicleId} onChange={(v) => set('vehicleId', v)} placeholder={any} />}</FormField>
        <FormField label={t('reports.vehicleType')}>{(id) => <LookupSelect id={id} entity="vehicle-types" value={form.vehicleTypeId} onChange={(v) => set('vehicleTypeId', v)} placeholder={any} />}</FormField>
        <FormField label={t('reports.col.costCenter')}>{(id) => <LookupSelect id={id} entity="cost-centers" value={form.costCenterId} onChange={(v) => set('costCenterId', v)} placeholder={any} />}</FormField>
      </section>
      <Rule variant="hairline" />
      <section className="space-y-3">
        <h4 className="text-13 font-semibold text-ink-2">{t('reports.section.what')}</h4>
        <FormField label={t('reports.col.expenseType')}>{(id) => <LookupSelect id={id} entity="expense-types" value={form.categoryId} onChange={(v) => set('categoryId', v)} placeholder={any} />}</FormField>
        <FormField label={t('reports.col.gl')}>{(id) => <LookupSelect id={id} entity="gl-accounts" value={form.glAccountId} onChange={(v) => set('glAccountId', v)} placeholder={any} />}</FormField>
        <fieldset>
          <legend className="mb-1 text-13 font-medium text-ink-2">{t('reports.statuses')}</legend>
          <div className="flex flex-col gap-2">
            {STATUSES.map((s) => (
              <Checkbox key={s} checked={form.statuses.includes(s)} onChange={(v) => set('statuses', v ? [...form.statuses, s] : form.statuses.filter((x) => x !== s))} label={t(`requests.status.${s}`)} />
            ))}
          </div>
        </fieldset>
        <FormField label={t('reports.stepRole')}>{(id) => <LookupSelect id={id} entity="roles" value={form.stepRoleId} onChange={(v) => set('stepRoleId', v)} placeholder={any} />}</FormField>
        <FormField label={t('reports.col.number')}>{(id) => <Input id={id} numeric value={form.number} onChange={(e) => set('number', e.target.value)} />}</FormField>
      </section>
      <Rule variant="hairline" />
      <section className="space-y-3">
        <h4 className="text-13 font-semibold text-ink-2">{t('reports.section.amounts')}</h4>
        <div className="grid grid-cols-2 gap-3">
          <FormField label={t('requests.filter.minAmount')}>{(id) => <Input id={id} numeric inputMode="decimal" value={form.minAmount} onChange={(e) => set('minAmount', e.target.value)} />}</FormField>
          <FormField label={t('requests.filter.maxAmount')}>{(id) => <Input id={id} numeric inputMode="decimal" value={form.maxAmount} onChange={(e) => set('maxAmount', e.target.value)} />}</FormField>
        </div>
      </section>
      <Rule variant="hairline" />
      <FormField label={t('reports.groupBy')}>
        {(id) => <Select id={id} value={form.groupBy} onChange={(v) => set('groupBy', v as FormState['groupBy'])} placeholder={t('reports.noGroup')} options={REPORT_GROUP_BY.map((g) => ({ value: g, label: t(`reports.group.${g}`) }))} />}
      </FormField>
      <div className="flex flex-wrap gap-2">
        <Button data-testid="report-run" icon={<Icon as={Play} size={16} />} loading={result.isFetching} onClick={run}>
          {t('reports.run')}
        </Button>
        <Button variant="ghost" onClick={reset}>
          {t('common.reset')}
        </Button>
      </div>
    </div>
  );

  const groupColumns: Column<NonNullable<ReportResultDto['groups']>[number]>[] = [
    { key: 'label', header: t(`reports.group.${applied?.groupBy || 'driver'}`), primary: true, cell: (g) => <span className="font-medium">{g.label}</span> },
    { key: 'count', header: t('reports.totals.count'), align: 'end', cell: (g) => <Num value={g.count} /> },
    { key: 'originalTotal', header: t('reports.totals.original'), align: 'end', cell: (g) => <Money value={g.originalTotal} muted /> },
    { key: 'finalTotal', header: t('reports.totals.final'), align: 'end', cell: (g) => <Money value={g.finalTotal} /> },
  ];

  return (
    <Page testId="page-reports" width="wide">
      <PageHeader
        title={t('reports.title')}
        subtitle={t('reports.subtitle')}
        actions={
          <>
            {!desktop && (
              <Button variant="secondary" icon={<Icon as={Filter} size={16} />} data-testid="filter-open" onClick={() => setDrawer(true)}>
                {t('reports.showFilters')}
              </Button>
            )}
            {canExport && (
              <Menu
                align="end"
                testId="report-export-menu"
                trigger={
                  <Button variant="secondary" icon={<Icon as={Download} size={16} />} loading={startExport.isPending} data-testid="report-export">
                    {t('reports.export')}
                  </Button>
                }
                items={exportItems}
              />
            )}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        {desktop ? (
          <div className="lg:sticky lg:top-[84px] lg:self-start">
            <Card title={t('reports.filters')}>{filters}</Card>
          </div>
        ) : (
          <Drawer open={drawer} onClose={() => setDrawer(false)} title={t('reports.filters')}>
            {filters}
          </Drawer>
        )}

        <div className="min-w-0 space-y-6">
          {result.isError && <ErrorBlock message={errorMessage(result.error)} />}

          {data ? (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Stat label={t('reports.totals.count')} value={<Num value={data.totals.count} />} />
                <Stat label={t('reports.totals.original')} value={<Money value={data.totals.originalTotal} size="lg" />} />
                <Stat label={t('reports.totals.final')} value={<Money value={data.totals.finalTotal} size="lg" />} accent />
              </div>
              {data.groups && (
                <Card title={t('reports.groups')} padded={false}>
                  <DataTable testId="report-groups" columns={groupColumns} rows={data.groups} rowKey={(g) => g.key} />
                </Card>
              )}
              <Card title={t('reports.rows')} padded={false}>
                <DataTable
                  testId="report-rows"
                  columns={columns}
                  rows={data.rows}
                  rowKey={(r) => r.lineId}
                  loading={result.isFetching}
                  page={data.page}
                  pageSize={data.pageSize}
                  total={data.totals.count}
                  onPageChange={setPage}
                />
              </Card>
            </>
          ) : (
            !result.isFetching && <p className="rounded-lg border border-dashed border-line px-4 py-10 text-center text-sm text-ink-3">{t('reports.selectFirst')}</p>
          )}

          <div data-testid="exports-list">
            <Card title={t('reports.exports')} padded={false}>
              {(exports.data ?? []).length === 0 ? (
                <p className="p-5 text-sm text-ink-3">{t('reports.noExports')}</p>
              ) : (
                <ul className="divide-y divide-hairline">
                  {(exports.data ?? []).map((e) => (
                    <li key={e.id} data-testid="export-row" className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 text-sm">
                      <span className="font-medium text-ink">{t(`reports.export.${e.kind}`)}</span>
                      <StatusChip kind="export" status={e.status} label={t(`reports.exportStatus.${e.status}`)} />
                      <span className="text-xs text-ink-3">
                        {e.rowCount !== null && <Num value={e.rowCount} />}
                        {e.rowCount !== null && e.sizeBytes !== null && ' · '}
                        {sizeText(e.sizeBytes)}
                      </span>
                      <span className="min-w-0 flex-1 text-xs text-danger">{e.error ?? ''}</span>
                      <DateText value={e.createdAt} mode="relative" className="text-xs text-ink-3" />
                      {e.downloadUrl && (
                        <Button size="sm" variant="link" icon={<Icon as={Download} size={16} />} onClick={() => void download(e)}>
                          {t('common.download')}
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      </div>
    </Page>
  );
}

