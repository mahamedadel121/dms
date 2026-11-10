'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { cairoDayToIso, formatDateTime, formatEgp } from '@/lib/format';
import { Badge, Card, ErrorBlock, PageHeader } from '@/components/ui/Display';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Button } from '@/components/ui/Button';
import { FormField, Input, Select } from '@/components/ui/Fields';
import { LookupSelect } from '@/components/ui/Inputs2';
import { useTr } from '../common/useTr';
import { statusTone } from './helpers';
import type { Paged, RequestListItem } from '../types';

const STATUSES = ['IN_REVIEW', 'CORRECTION_REQUESTED', 'APPROVED', 'PAID', 'REJECTED'];
const EMPTY = { status: '', number: '', submitterId: '', vehicleId: '', stepRoleId: '', from: '', to: '' };

export function RequestsListPage() {
  const { t, locale } = useTr();
  const router = useRouter();
  const [f, setF] = useState(EMPTY);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('submittedAt:desc');
  const set = (k: keyof typeof EMPTY, v: string) => {
    setF((p) => ({ ...p, [k]: v }));
    setPage(1);
  };
  const query = useMemo(
    () => ({
      ...f,
      from: f.from ? cairoDayToIso(f.from) : '',
      to: f.to ? cairoDayToIso(f.to, true) : '',
      page,
      pageSize: 25,
      sort,
    }),
    [f, page, sort],
  );
  const q = useQuery({
    queryKey: ['requests', query],
    queryFn: () => api.get<Paged<RequestListItem>>('/requests', query),
    placeholderData: keepPreviousData,
  });

  const columns: Column<RequestListItem>[] = [
    { key: 'number', header: t('requests.col.number'), sortable: true, primary: true, cell: (r) => <span className="font-semibold text-brand-800">{r.number}</span> },
    { key: 'submitterName', header: t('requests.col.driver') },
    { key: 'vehicle', header: t('requests.col.vehicle'), cell: (r) => String(r.summary?.vehicleNumber ?? '') },
    { key: 'totalFinal', header: t('requests.col.total'), sortable: true, cell: (r) => <span className="tabular-nums">{formatEgp(r.totalFinal, locale)}</span> },
    { key: 'status', header: t('requests.col.status'), cell: (r) => <Badge tone={statusTone(r.status)}>{t(`requests.status.${r.status}`)}</Badge> },
    { key: 'submittedAt', header: t('requests.col.submittedAt'), sortable: true, cell: (r) => formatDateTime(r.submittedAt) },
  ];

  return (
    <div>
      <PageHeader title={t('requests.list.title')} />
      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <FormField label={t('requests.col.number')}>{(id) => <Input id={id} value={f.number} onChange={(e) => set('number', e.target.value)} placeholder="DE-26-" />}</FormField>
          <FormField label={t('requests.col.status')}>
            {(id) => (
              <Select id={id} value={f.status} onChange={(v) => set('status', v)} placeholder={t('requests.filter.any')} options={STATUSES.map((s) => ({ value: s, label: t(`requests.status.${s}`) }))} />
            )}
          </FormField>
          <FormField label={t('requests.filter.driver')}>
            {(id) => <LookupSelect id={id} entity="submitters" value={f.submitterId} onChange={(v) => set('submitterId', v)} placeholder={t('requests.filter.any')} />}
          </FormField>
          <FormField label={t('requests.filter.vehicle')}>
            {(id) => <LookupSelect id={id} entity="vehicles" value={f.vehicleId} onChange={(v) => set('vehicleId', v)} placeholder={t('requests.filter.any')} />}
          </FormField>
          <FormField label={t('requests.list.atRole')}>
            {(id) => <LookupSelect id={id} entity="roles" value={f.stepRoleId} onChange={(v) => set('stepRoleId', v)} placeholder={t('requests.filter.any')} />}
          </FormField>
          <FormField label={t('requests.filter.from')}>{(id) => <Input id={id} type="date" value={f.from} onChange={(e) => set('from', e.target.value)} />}</FormField>
          <FormField label={t('requests.filter.to')}>{(id) => <Input id={id} type="date" value={f.to} onChange={(e) => set('to', e.target.value)} />}</FormField>
          <div className="flex items-end pb-1">
            <Button variant="ghost" size="sm" onClick={() => setF(EMPTY)}>
              {t('common.reset')}
            </Button>
          </div>
        </div>
      </Card>
      {q.isError && <ErrorBlock message={(q.error as Error).message} />}
      <Card padded={false}>
        <DataTable
          columns={columns}
          rows={q.data?.items}
          rowKey={(r) => r.id}
          loading={q.isFetching}
          page={q.data?.page ?? page}
          pageSize={q.data?.pageSize ?? 25}
          total={q.data?.total ?? 0}
          onPageChange={setPage}
          sort={sort}
          onSortChange={setSort}
          onRowClick={(r) => router.push(`/requests/${r.id}`)}
        />
      </Card>
    </div>
  );
}
