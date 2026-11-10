'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { SAP_POSTING_STATUSES } from '@dms/shared';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cairoDayToIso } from '@/lib/format';
import {
  Banner,
  Button,
  Checkbox,
  Code,
  DataTable,
  DateText,
  DL,
  DLItem,
  Drawer,
  ErrorBlock,
  FilterBar,
  FormField,
  Icon,
  LoadingBlock,
  Modal,
  Money,
  Num,
  Page,
  PageHeader,
  SearchInput,
  Select,
  Stat,
  StatusChip,
  Tooltip,
  useToast,
  type Column,
} from '@/components/ui';
import { DateRange } from '@/components/ui/Inputs2';
import { useTr } from '../common/useTr';
import type { SapPostingDetail, SapPostingList, SapPostingListItem } from '../types';

const EMPTY = { status: '', number: '', from: '', to: '' };
const MAX_ATTEMPTS = 8;
const isUnknown = (err: string | null | undefined) => !!err && err.startsWith('UNKNOWN_OUTCOME');

export function SapPage() {
  const { t } = useTr();
  const { can } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [f, setF] = useState(EMPTY);
  const [page, setPage] = useState(1);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [forceFor, setForceFor] = useState<string | null>(null);
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

  const counts = useQueries({
    queries: SAP_POSTING_STATUSES.map((status) => ({
      queryKey: ['sap-count', status],
      queryFn: () => api.get<SapPostingList>('/sap/postings', { status, page: 1, pageSize: 1 }).then((r) => r.total),
      refetchInterval: 20_000,
    })),
  });
  const countOf = (status: string) => counts[SAP_POSTING_STATUSES.indexOf(status as (typeof SAP_POSTING_STATUSES)[number])]?.data;

  const retry = useMutation({
    mutationFn: (v: { id: string; force?: boolean }) => api.post(`/sap/postings/${v.id}/retry`, v.force ? { force: true } : {}),
    onSuccess: () => {
      toast.success(t('sap.retryQueued'));
      setForceFor(null);
      void qc.invalidateQueries({ queryKey: ['sap-postings'] });
      void qc.invalidateQueries({ queryKey: ['sap-posting'] });
      void qc.invalidateQueries({ queryKey: ['sap-count'] });
    },
    onError: (e) => toast.error(e),
  });
  const canRetry = can('sap.retry');
  const startRetry = (p: { id: string; lastError: string | null }) => (isUnknown(p.lastError) ? setForceFor(p.id) : retry.mutate({ id: p.id }));

  const columns: Column<SapPostingListItem>[] = [
    {
      key: 'requestNumber',
      header: t('sap.col.request'),
      primary: true,
      cell: (r) => (
        <Link href={`/requests/${r.requestId}`} className="text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
          <Code>{r.requestNumber}</Code>
        </Link>
      ),
    },
    { key: 'status', header: t('sap.col.status'), cell: (r) => <StatusChip kind="sap" status={r.status} label={t(`sap.status.${r.status}`)} /> },
    {
      key: 'sapDocNumber',
      header: t('sap.col.doc'),
      cell: (r) => (r.sapDocNumber ? <Code>{`${r.sapDocNumber}${r.sapFiscalYear ? ` / ${r.sapFiscalYear}` : ''}`}</Code> : '—'),
    },
    {
      key: 'attempts',
      header: t('sap.col.attempts'),
      cell: (r) => (
        <span>
          <Num value={r.attempts} /> <span className="text-ink-3">{t('sap.maxAttempts', { n: MAX_ATTEMPTS })}</span>
        </span>
      ),
    },
    {
      key: 'lastError',
      header: t('sap.col.error'),
      cell: (r) =>
        r.lastError ? (
          <Tooltip content={r.lastError}>
            <span className="block max-w-xs truncate text-xs text-danger">{r.lastError}</span>
          </Tooltip>
        ) : (
          ''
        ),
    },
    { key: 'updatedAt', header: t('sap.col.updated'), cell: (r) => <DateText value={r.updatedAt} mode="relative" /> },
  ];

  const activeCount = [f.status, f.number, f.from, f.to].filter(Boolean).length;

  return (
    <Page testId="page-sap" width="wide">
      <PageHeader title={t('sap.title')} subtitle={t('sap.subtitle')} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {(['POSTED', 'FAILED', 'PENDING', 'POSTING'] as const).map((s) => {
          const n = countOf(s);
          return (
            <Stat
              key={s}
              testId={`sap-counter-${s}`}
              label={t(`sap.status.${s}`)}
              value={<Num value={n} />}
              loading={n === undefined}
              tone={s === 'FAILED' && (n ?? 0) > 0 ? 'danger' : 'default'}
              active={f.status === s}
              onClick={() => set('status', f.status === s ? '' : s)}
            />
          );
        })}
      </div>

      <FilterBar
        activeCount={activeCount}
        onReset={() => {
          setF(EMPTY);
          setPage(1);
        }}
        search={<SearchInput value={f.number} onChange={(v) => set('number', v)} placeholder={t('sap.searchNumber')} ltr />}
      >
        <FormField label={t('sap.col.status')}>
          {(id) => <Select id={id} value={f.status} onChange={(v) => set('status', v)} placeholder={t('requests.filter.any')} options={SAP_POSTING_STATUSES.map((s) => ({ value: s, label: t(`sap.status.${s}`) }))} />}
        </FormField>
        <DateRange from={f.from} to={f.to} onChange={(v) => setF((p) => ({ ...p, ...v }))} />
      </FilterBar>

      {q.isError && <ErrorBlock message={errorMessage(q.error)} onRetry={() => void q.refetch()} />}
      <DataTable
        testId="sap"
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
                  <Button size="sm" variant="secondary" icon={<Icon as={RefreshCw} size={16} />} loading={retry.isPending && retry.variables?.id === r.id} onClick={() => startRetry(r)}>
                    {t('sap.retry')}
                  </Button>
                ) : null
            : undefined
        }
      />

      <PostingDrawer id={detailId} onClose={() => setDetailId(null)} canRetry={canRetry} onRetry={startRetry} retrying={retry.isPending} />

      <ForceDialog open={!!forceFor} busy={retry.isPending} onClose={() => setForceFor(null)} onConfirm={() => forceFor && retry.mutate({ id: forceFor, force: true })} />
    </Page>
  );
}

function ForceDialog({ open, busy, onClose, onConfirm }: { open: boolean; busy: boolean; onClose: () => void; onConfirm: () => void }) {
  const { t } = useTr();
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    if (!open) setChecked(false);
  }, [open]);
  const close = () => {
    setChecked(false);
    onClose();
  };
  return (
    <Modal
      open={open}
      onClose={close}
      title={t('sap.force.title')}
      testId="sap-force-dialog"
      dismissable={!busy}
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button variant="danger" data-testid="sap-force-confirm" disabled={!checked} loading={busy} onClick={onConfirm}>
            {t('sap.force.confirm')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Banner tone="warning">{t('sap.force.warning')}</Banner>
        <Checkbox data-testid="sap-force-check" checked={checked} onChange={setChecked} label={t('sap.force.confirmCheck')} />
      </div>
    </Modal>
  );
}

function PostingDrawer({
  id,
  onClose,
  canRetry,
  onRetry,
  retrying,
}: {
  id: string | null;
  onClose: () => void;
  canRetry: boolean;
  onRetry: (p: { id: string; lastError: string | null }) => void;
  retrying: boolean;
}) {
  const { t } = useTr();
  const q = useQuery({ queryKey: ['sap-posting', id], enabled: !!id, queryFn: () => api.get<SapPostingDetail>(`/sap/postings/${id}`) });
  const d = q.data;
  const items = journalItems(d?.payload);
  return (
    <Drawer
      open={!!id}
      onClose={onClose}
      width="lg"
      testId="sap-drawer"
      title={d ? `${t('sap.detail')} - ${d.requestNumber}` : t('sap.detail')}
      footer={
        d?.status === 'FAILED' && canRetry ? (
          <Button data-testid="sap-retry" icon={<Icon as={RefreshCw} size={16} />} loading={retrying} onClick={() => onRetry({ id: d.id, lastError: d.lastError })}>
            {t('sap.retry')}
          </Button>
        ) : undefined
      }
    >
      {q.isLoading && <LoadingBlock />}
      {q.isError && <ErrorBlock message={errorMessage(q.error)} />}
      {d && (
        <div className="space-y-6 text-sm">
          <DL cols={2}>
            <DLItem label={t('sap.col.status')}>
              <StatusChip kind="sap" status={d.status} label={t(`sap.status.${d.status}`)} />
            </DLItem>
            <DLItem label={t('sap.col.total')}>
              <Money value={d.totalFinal} />
            </DLItem>
            <DLItem label={t('sap.col.doc')}>{d.sapDocNumber ? <Code>{`${d.sapDocNumber} / ${d.sapFiscalYear ?? ''}`}</Code> : '—'}</DLItem>
            <DLItem label={t('sap.adapter')}>{d.adapter}</DLItem>
            <DLItem label={t('sap.col.attempts')}>
              <Num value={d.attempts} />
            </DLItem>
            <DLItem label={t('sap.nextRetry')}>
              <DateText value={d.nextRetryAt} mode="dayTime" />
            </DLItem>
            <DLItem label={t('sap.postedAt')}>
              <DateText value={d.postedAt} mode="dayTime" />
            </DLItem>
            <DLItem label={t('sap.idempotencyKey')}>
              <Code>{d.idempotencyKey}</Code>
            </DLItem>
          </DL>
          {d.lastError && <ErrorBlock message={d.lastError} />}

          <section>
            <h4 className="mb-2 font-semibold text-ink">{t('sap.journal')}</h4>
            {items.length === 0 ? (
              <p className="text-ink-3">{t('sap.noJournal')}</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-hairline">
                <table className="min-w-full text-sm">
                  <thead className="bg-surface-2 text-13 text-ink-2">
                    <tr>
                      <th className="h-9 px-3 text-start font-medium">{t('sap.side')}</th>
                      <th className="px-3 text-start font-medium">{t('sap.gl')}</th>
                      <th className="px-3 text-start font-medium">{t('sap.costCenter')}</th>
                      <th className="px-3 text-end font-medium">{t('sap.amount')}</th>
                      <th className="px-3 text-start font-medium">{t('sap.text')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline">
                    {items.map((it, i) => (
                      <tr key={i}>
                        <td className="h-10 px-3">{t(`sap.side.${it.side}`)}</td>
                        <td className="px-3">
                          <Code>{it.glAccount}</Code>
                        </td>
                        <td className="px-3">{it.costCenter ? <Code>{it.costCenter}</Code> : '—'}</td>
                        <td className="px-3 text-end">
                          <Money value={it.amount} />
                        </td>
                        <td className="px-3 text-ink-2">{it.itemText}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section>
            <h4 className="mb-2 font-semibold text-ink">{t('sap.attempts')}</h4>
            {d.attemptLogs.length === 0 ? (
              <p className="text-ink-3">{t('sap.noAttempts')}</p>
            ) : (
              <ul className="space-y-2">
                {d.attemptLogs.map((a) => (
                  <li key={a.id} className="rounded-lg border border-hairline p-3 text-xs">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="font-semibold">
                        #<Num value={a.attemptNo} />
                      </span>
                      <span className="text-ink-2">{a.trigger === 'MANUAL' ? t('sap.manual') : t('sap.auto')}</span>
                      <DateText value={a.startedAt} mode="dayTime" className="text-ink-3" />
                      <span className={a.success ? 'text-success' : a.success === false ? 'text-danger' : 'text-ink-3'}>{a.success ? t('sap.ok') : a.success === false ? t('sap.failed') : '...'}</span>
                    </div>
                    {a.error && <p className="mt-1 break-words text-danger">{a.error}</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </Drawer>
  );
}

interface JournalItem {
  side: 'D' | 'C';
  glAccount: string;
  costCenter?: string;
  amount: string;
  itemText: string;
}

function journalItems(payload: unknown): JournalItem[] {
  const items = (payload as { items?: unknown } | null | undefined)?.items;
  return Array.isArray(items) ? (items as JournalItem[]) : [];
}
