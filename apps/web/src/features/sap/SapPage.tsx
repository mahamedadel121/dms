'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { SAP_POSTING_STATUSES } from '@dms/shared';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cairoDayToIso, formatDateTime, formatEgp } from '@/lib/format';
import { Badge, Card, ErrorBlock, LoadingBlock, PageHeader } from '@/components/ui/Display';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Button } from '@/components/ui/Button';
import { FormField, Input, Select } from '@/components/ui/Fields';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useTr } from '../common/useTr';
import type { SapPostingDetail, SapPostingList, SapPostingListItem, SapPostingStatusValue } from '../types';

const tone: Record<SapPostingStatusValue, 'amber' | 'blue' | 'green' | 'red'> = { PENDING: 'amber', POSTING: 'blue', POSTED: 'green', FAILED: 'red' };
const EMPTY = { status: '', number: '', from: '', to: '' };

export function SapPage() {
  const { t, locale } = useTr();
  const { can } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [f, setF] = useState(EMPTY);
  const [page, setPage] = useState(1);
  const [detailId, setDetailId] = useState<string | null>(null);
  const set = (k: keyof typeof EMPTY, v: string) => {
    setF((p) => ({ ...p, [k]: v }));
    setPage(1);
  };
  const query = useMemo(
    () => ({ ...f, from: f.from ? cairoDayToIso(f.from) : '', to: f.to ? cairoDayToIso(f.to, true) : '', page, pageSize: 25 }),
    [f, page],
  );
  const q = useQuery({
    queryKey: ['sap-postings', query],
    queryFn: () => api.get<SapPostingList>('/sap/postings', query),
    placeholderData: keepPreviousData,
    refetchInterval: 20_000,
  });

  const retry = useMutation({
    mutationFn: (id: string) => api.post(`/sap/postings/${id}/retry`),
    onSuccess: () => {
      toast.success(t('sap.retryQueued'));
      void qc.invalidateQueries({ queryKey: ['sap-postings'] });
      void qc.invalidateQueries({ queryKey: ['sap-posting'] });
    },
    onError: (e) => toast.error(e),
  });
  const canRetry = can('sap.retry');

  const columns: Column<SapPostingListItem>[] = [
    {
      key: 'requestNumber',
      header: t('sap.col.request'),
      primary: true,
      cell: (r) => (
        <Link href={`/requests/${r.requestId}`} className="font-semibold text-brand-800 hover:underline" onClick={(e) => e.stopPropagation()}>
          {r.requestNumber}
        </Link>
      ),
    },
    { key: 'status', header: t('sap.col.status'), cell: (r) => <Badge tone={tone[r.status]}>{t(`sap.status.${r.status}`)}</Badge> },
    { key: 'totalFinal', header: t('sap.col.total'), cell: (r) => <span className="tabular-nums">{formatEgp(r.totalFinal, locale)}</span> },
    { key: 'sapDocNumber', header: t('sap.col.doc'), cell: (r) => (r.sapDocNumber ? `${r.sapDocNumber}${r.sapFiscalYear ? ` / ${r.sapFiscalYear}` : ''}` : '—') },
    { key: 'attempts', header: t('sap.col.attempts') },
    { key: 'lastError', header: t('sap.col.error'), hideOnMobile: false, cell: (r) => <span className="line-clamp-2 max-w-xs text-xs text-red-700">{r.lastError ?? ''}</span> },
    { key: 'updatedAt', header: t('sap.col.updated'), cell: (r) => formatDateTime(r.updatedAt) },
  ];

  return (
    <div>
      <PageHeader title={t('sap.title')} subtitle={t('sap.subtitle')} />
      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <FormField label={t('sap.col.status')}>
            {(id) => <Select id={id} value={f.status} onChange={(v) => set('status', v)} placeholder={t('requests.filter.any')} options={SAP_POSTING_STATUSES.map((s) => ({ value: s, label: t(`sap.status.${s}`) }))} />}
          </FormField>
          <FormField label={t('sap.col.request')}>{(id) => <Input id={id} value={f.number} onChange={(e) => set('number', e.target.value)} placeholder="DE-26-" />}</FormField>
          <FormField label={t('requests.filter.from')}>{(id) => <Input id={id} type="date" value={f.from} onChange={(e) => set('from', e.target.value)} />}</FormField>
          <FormField label={t('requests.filter.to')}>{(id) => <Input id={id} type="date" value={f.to} onChange={(e) => set('to', e.target.value)} />}</FormField>
        </div>
      </Card>
      {q.isError && <ErrorBlock message={errorMessage(q.error)} />}
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
          onRowClick={(r) => setDetailId(r.id)}
          rowActions={
            canRetry
              ? (r) =>
                  r.status === 'FAILED' ? (
                    <Button size="sm" variant="secondary" icon={<RefreshCw className="h-4 w-4" />} loading={retry.isPending && retry.variables === r.id} onClick={() => retry.mutate(r.id)}>
                      {t('sap.retry')}
                    </Button>
                  ) : null
              : undefined
          }
        />
      </Card>
      <PostingModal id={detailId} onClose={() => setDetailId(null)} canRetry={canRetry} onRetry={(id) => retry.mutate(id)} retrying={retry.isPending} />
    </div>
  );
}

function PostingModal({ id, onClose, canRetry, onRetry, retrying }: { id: string | null; onClose: () => void; canRetry: boolean; onRetry: (id: string) => void; retrying: boolean }) {
  const { t, locale } = useTr();
  const q = useQuery({ queryKey: ['sap-posting', id], enabled: !!id, queryFn: () => api.get<SapPostingDetail>(`/sap/postings/${id}`) });
  const d = q.data;
  return (
    <Modal
      open={!!id}
      onClose={onClose}
      size="xl"
      title={d ? `${t('sap.detail')} — ${d.requestNumber}` : t('sap.detail')}
      footer={
        d?.status === 'FAILED' && canRetry ? (
          <Button icon={<RefreshCw className="h-4 w-4" />} loading={retrying} onClick={() => onRetry(d.id)}>
            {t('sap.retry')}
          </Button>
        ) : undefined
      }
    >
      {q.isLoading && <LoadingBlock />}
      {q.isError && <ErrorBlock message={errorMessage(q.error)} />}
      {d && (
        <div className="space-y-4 text-sm">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KV k={t('sap.col.status')} v={<Badge tone={tone[d.status]}>{t(`sap.status.${d.status}`)}</Badge>} />
            <KV k={t('sap.col.total')} v={formatEgp(d.totalFinal, locale)} />
            <KV k={t('sap.col.doc')} v={d.sapDocNumber ? `${d.sapDocNumber} / ${d.sapFiscalYear ?? ''}` : '—'} />
            <KV k={t('sap.adapter')} v={d.adapter} />
            <KV k={t('sap.col.attempts')} v={String(d.attempts)} />
            <KV k={t('sap.nextRetry')} v={d.nextRetryAt ? formatDateTime(d.nextRetryAt) : '—'} />
            <KV k={t('sap.postedAt')} v={d.postedAt ? formatDateTime(d.postedAt) : '—'} />
            <KV k={t('sap.idempotencyKey')} v={<code className="text-xs">{d.idempotencyKey}</code>} />
          </dl>
          {d.lastError && <ErrorBlock message={d.lastError} />}
          <section>
            <h4 className="mb-1 font-bold">{t('sap.attempts')}</h4>
            {d.attemptLogs.length === 0 ? (
              <p className="text-slate-500">—</p>
            ) : (
              <ul className="space-y-1">
                {d.attemptLogs.map((a) => (
                  <li key={a.id} className="rounded border border-slate-200 p-2 text-xs">
                    <span className="font-semibold">#{a.attemptNo}</span> · {a.trigger === 'MANUAL' ? t('sap.manual') : t('sap.auto')} · {formatDateTime(a.startedAt)} ·{' '}
                    <span className={a.success ? 'text-emerald-700' : a.success === false ? 'text-red-700' : ''}>{a.success ? t('sap.ok') : a.success === false ? t('sap.failed') : '…'}</span>
                    {a.error && <span className="block text-red-700">{a.error}</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section>
            <h4 className="mb-1 font-bold">{t('sap.payload')}</h4>
            <pre dir="ltr" className="max-h-72 overflow-auto rounded bg-slate-50 p-2 text-xs">{JSON.stringify(d.payload, null, 2)}</pre>
          </section>
        </div>
      )}
    </Modal>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{k}</dt>
      <dd className="font-semibold">{v}</dd>
    </div>
  );
}
