'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { cairoDayToIso, formatDateTime } from '@/lib/format';
import type { Paged } from '@/lib/types';
import { Badge, Button, Card, DataTable, DateRange, ErrorBlock, Input, LookupSelect, Modal, PageHeader } from '@/components/ui';

interface AuditRow {
  id: string;
  createdAt: string;
  actorType: string;
  actorUserId: string | null;
  actorLabel: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
  meta: unknown;
  ip: string | null;
}

const PAGE_SIZE = 25;

function Json({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined) return null;
  return (
    <div>
      <p className="mb-1 text-xs font-bold text-slate-500">{label}</p>
      <pre dir="ltr" className="max-h-64 overflow-auto rounded-md bg-slate-900 p-3 text-xs leading-relaxed text-slate-100">{JSON.stringify(value, null, 2)}</pre>
    </div>
  );
}

export default function AuditPage() {
  const { t } = useT();
  const [page, setPage] = useState(1);
  const [f, setF] = useState({ q: '', action: '', entityType: '', actorUserId: '', from: '', to: '' });
  const [applied, setApplied] = useState(f);
  const [row, setRow] = useState<AuditRow | null>(null);

  const query = {
    page,
    pageSize: PAGE_SIZE,
    q: applied.q.trim(),
    action: applied.action.trim(),
    entityType: applied.entityType.trim(),
    actorUserId: applied.actorUserId,
    from: applied.from ? cairoDayToIso(applied.from) : '',
    to: applied.to ? cairoDayToIso(applied.to, true) : '',
  };
  const list = useQuery({ queryKey: ['audit', query], queryFn: () => api.get<Paged<AuditRow>>('/audit-logs', query), placeholderData: (p) => p });

  return (
    <>
      <PageHeader title={t('admin.audit.title')} subtitle={t('admin.audit.subtitle')} />
      <Card padded={false}>
        <form
          className="grid gap-2 border-b border-slate-100 p-3 sm:grid-cols-2 lg:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setApplied(f);
          }}
        >
          <Input value={f.q} placeholder={t('common.searchPlaceholder')} onChange={(e) => setF({ ...f, q: e.target.value })} />
          <Input value={f.action} dir="ltr" placeholder={t('admin.audit.action') + ' (user.create)'} onChange={(e) => setF({ ...f, action: e.target.value })} />
          <Input value={f.entityType} dir="ltr" placeholder={t('admin.audit.entityType') + ' (Role)'} onChange={(e) => setF({ ...f, entityType: e.target.value })} />
          <LookupSelect entity="users" value={f.actorUserId} placeholder={t('admin.audit.allUsers')} onChange={(v) => setF({ ...f, actorUserId: v })} />
          <DateRange from={f.from} to={f.to} onChange={(v) => setF({ ...f, ...v })} className="sm:col-span-2" />
          <div className="flex gap-2">
            <Button type="submit" icon={<Search className="h-4 w-4" />}>{t('common.filter')}</Button>
            <Button
              variant="secondary"
              onClick={() => {
                const empty = { q: '', action: '', entityType: '', actorUserId: '', from: '', to: '' };
                setF(empty);
                setApplied(empty);
                setPage(1);
              }}
            >
              {t('common.reset')}
            </Button>
          </div>
        </form>
        {list.error ? (
          <div className="p-4"><ErrorBlock message={errorMessage(list.error)} /></div>
        ) : (
          <DataTable<AuditRow>
            rows={list.data?.items}
            rowKey={(r) => r.id}
            loading={list.isFetching}
            page={page}
            pageSize={PAGE_SIZE}
            total={list.data?.total ?? 0}
            onPageChange={setPage}
            onRowClick={setRow}
            columns={[
              { key: 'createdAt', header: t('admin.audit.time'), cell: (r) => <bdi>{formatDateTime(r.createdAt)}</bdi> },
              { key: 'action', header: t('admin.audit.action'), primary: true, cell: (r) => <code dir="ltr" className="text-xs font-semibold">{r.action}</code> },
              { key: 'actor', header: t('admin.audit.actor'), cell: (r) => r.actorLabel ?? r.actorType },
              { key: 'entity', header: t('admin.audit.entity'), cell: (r) => <span dir="ltr">{r.entityType}{r.entityId ? ` / ${r.entityId.slice(0, 10)}` : ''}</span> },
            ]}
          />
        )}
      </Card>
      <Modal open={!!row} onClose={() => setRow(null)} size="xl" title={t('admin.audit.details')}>
        {row && (
          <div className="space-y-4">
            <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
              <div><dt className="inline text-slate-500">{t('admin.audit.time')}: </dt><dd className="inline">{formatDateTime(row.createdAt)}</dd></div>
              <div><dt className="inline text-slate-500">{t('admin.audit.actor')}: </dt><dd className="inline">{row.actorLabel ?? '-'} <Badge>{row.actorType}</Badge></dd></div>
              <div><dt className="inline text-slate-500">{t('admin.audit.action')}: </dt><dd className="inline" dir="ltr">{row.action}</dd></div>
              <div><dt className="inline text-slate-500">{t('admin.audit.entity')}: </dt><dd className="inline" dir="ltr">{row.entityType} {row.entityId}</dd></div>
              {row.ip && <div><dt className="inline text-slate-500">{t('admin.audit.ip')}: </dt><dd className="inline" dir="ltr">{row.ip}</dd></div>}
            </dl>
            <div className="grid gap-3 lg:grid-cols-2">
              <Json label={t('admin.audit.before')} value={row.before} />
              <Json label={t('admin.audit.after')} value={row.after} />
            </div>
            <Json label={t('admin.audit.meta')} value={row.meta} />
          </div>
        )}
      </Modal>
    </>
  );
}
