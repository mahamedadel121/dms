'use client';

import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { FileSearch } from 'lucide-react';
import { api } from '@/lib/api';
import { cairoDayToIso } from '@/lib/format';
import {
  Avatar, Code, DataTable, DateRange, DateText, ErrorBlock, FilterBar, FormField, Icon, LookupSelect, Money, Page, PageHeader, SearchInput, Select, StatusChip,
  type Column,
} from '@/components/ui';
import { useTr } from '../common/useTr';
import type { Paged, RequestListItem } from '../types';

const STATUSES = ['IN_REVIEW', 'CORRECTION_REQUESTED', 'APPROVED', 'PAID', 'REJECTED'];
const EMPTY = { status: '', number: '', submitterId: '', vehicleId: '', stepRoleId: '', from: '', to: '' };

export function RequestsListPage() {
  const { t } = useTr();
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
    { key: 'number', header: t('requests.col.number'), sortable: true, primary: true, cell: (r) => <Code className="font-medium text-link">{r.number}</Code> },
    {
      key: 'submitterName',
      header: t('requests.col.driver'),
      cell: (r) => (
        <span className="inline-flex items-center gap-2">
          <Avatar name={r.submitterName} size={24} />
          <span>{r.submitterName}</span>
        </span>
      ),
    },
    { key: 'vehicle', header: t('requests.col.vehicle'), cell: (r) => <Code>{String(r.summary?.vehicleNumber ?? '')}</Code> },
    { key: 'totalFinal', header: t('requests.col.total'), sortable: true, align: 'end', cell: (r) => <Money value={r.totalFinal} /> },
    { key: 'status', header: t('requests.col.status'), cell: (r) => <StatusChip kind="request" status={r.status} label={t(`requests.status.${r.status}`)} /> },
    { key: 'submittedAt', header: t('requests.col.submittedAt'), sortable: true, cell: (r) => <DateText value={r.submittedAt} mode="dayTime" /> },
  ];

  const activeCount = Object.values(f).filter(Boolean).length;

  return (
    <Page testId="page-requests">
      <PageHeader title={t('requests.list.title')} />
      <FilterBar
        activeCount={activeCount}
        onReset={() => {
          setF(EMPTY);
          setPage(1);
        }}
        search={<SearchInput ltr value={f.number} onChange={(v) => set('number', v)} placeholder={t('inbox.searchNumber')} />}
      >
        <FormField label={t('requests.col.status')} className="w-44">
          {(id) => (
            <Select id={id} value={f.status} onChange={(v) => set('status', v)} placeholder={t('requests.filter.any')} options={STATUSES.map((s) => ({ value: s, label: t(`requests.status.${s}`) }))} />
          )}
        </FormField>
        <FormField label={t('requests.filter.driver')} className="w-44">
          {(id) => <LookupSelect id={id} entity="submitters" value={f.submitterId} onChange={(v) => set('submitterId', v)} placeholder={t('requests.filter.any')} />}
        </FormField>
        <FormField label={t('requests.filter.vehicle')} className="w-44">
          {(id) => <LookupSelect id={id} entity="vehicles" value={f.vehicleId} onChange={(v) => set('vehicleId', v)} placeholder={t('requests.filter.any')} />}
        </FormField>
        <FormField label={t('requests.list.atRole')} className="w-44">
          {(id) => <LookupSelect id={id} entity="roles" value={f.stepRoleId} onChange={(v) => set('stepRoleId', v)} placeholder={t('requests.filter.any')} />}
        </FormField>
        <DateRange
          from={f.from}
          to={f.to}
          onChange={(v) => {
            setF((p) => ({ ...p, ...v }));
            setPage(1);
          }}
        />
      </FilterBar>
      {q.isError && <ErrorBlock message={(q.error as Error).message} onRetry={() => void q.refetch()} />}
      <DataTable
        testId="requests"
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
        rowHref={(r) => `/requests/${r.id}`}
        emptyIcon={<Icon as={FileSearch} size={24} />}
        emptyTitle={t('inbox.requestsEmpty')}
        mobileCard={(r) => (
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <Code className="font-medium text-link">{r.number}</Code>
              <Money value={r.totalFinal} size="md" />
            </div>
            <div className="text-sm text-ink-2">
              {r.submitterName}
              {r.summary?.vehicleNumber ? (
                <>
                  {' · '}
                  <Code>{String(r.summary.vehicleNumber)}</Code>
                </>
              ) : null}
            </div>
            <div className="flex items-center justify-between gap-2">
              <StatusChip kind="request" size="sm" status={r.status} label={t(`requests.status.${r.status}`)} />
              <DateText value={r.submittedAt} mode="relative" className="text-xs text-ink-3" />
            </div>
          </div>
        )}
      />
    </Page>
  );
}
