'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Lock } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { cairoDayToIso } from '@/lib/format';
import type { Paged } from '@/lib/types';
import {
  Badge, Code, DataTable, DateRange, DateText, Drawer, DL, DLItem, ErrorBlock, FilterBar, FormField, Icon, Input, LookupSelect, Page, PageHeader, SearchInput,
} from '@/components/ui';

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
const EMPTY = { q: '', action: '', entityType: '', entityId: '', actorUserId: '', from: '', to: '' };

/** Raw JSON panel (cut C3: no field-level diff viewer yet; `features/admin/diff.ts` is ready for it). */
function Json({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined) return null;
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-ink-3">{label}</p>
      <pre dir="ltr" className="code max-h-64 overflow-auto rounded border border-hairline bg-surface-2 p-3 text-xs leading-relaxed text-ink">{JSON.stringify(value, null, 2)}</pre>
    </div>
  );
}

export default function AuditPage() {
  const { t } = useT();
  const [page, setPage] = useState(1);
  const [f, setF] = useState(EMPTY);
  const [row, setRow] = useState<AuditRow | null>(null);

  const query = {
    page,
    pageSize: PAGE_SIZE,
    q: [f.q.trim(), f.entityId.trim()].filter(Boolean).join(' '),
    action: f.action.trim(),
    entityType: f.entityType.trim(),
    actorUserId: f.actorUserId,
    from: f.from ? cairoDayToIso(f.from) : '',
    to: f.to ? cairoDayToIso(f.to, true) : '',
  };
  const list = useQuery({ queryKey: ['audit', query], queryFn: () => api.get<Paged<AuditRow>>('/audit-logs', query), placeholderData: (p) => p });
  const activeCount = Object.values(f).filter((v) => v !== '').length;
  const upd = (patch: Partial<typeof EMPTY>) => {
    setPage(1);
    setF((x) => ({ ...x, ...patch }));
  };

  const actionLabel = (code: string) => {
    const k = `admin.audit.action.${code}`;
    const v = t(k);
    return v === k ? null : v;
  };

  return (
    <Page testId="page-admin-audit">
      <PageHeader
        title={t('admin.audit.title')}
        subtitle={t('admin.audit.subtitle')}
        meta={
          <span className="inline-flex items-center gap-1.5 text-xs text-ink-3">
            <Icon as={Lock} size={14} />
            {t('admin.audit.immutable')}
          </span>
        }
      />
      <FilterBar
        activeCount={activeCount}
        onReset={() => {
          setPage(1);
          setF(EMPTY);
        }}
        search={<SearchInput value={f.q} onChange={(v) => upd({ q: v })} placeholder={t('common.searchPlaceholder')} />}
      >
        <FormField label={t('admin.audit.dateRange')} className="w-auto">
          {() => <DateRange from={f.from} to={f.to} onChange={(v) => upd(v)} />}
        </FormField>
        <FormField label={t('admin.audit.actor')} className="w-44">
          {(id) => <LookupSelect id={id} entity="users" value={f.actorUserId} placeholder={t('admin.audit.allUsers')} onChange={(v) => upd({ actorUserId: v })} />}
        </FormField>
        <FormField label={t('admin.audit.action')} className="w-44">
          {(id) => <Input id={id} dir="ltr" value={f.action} placeholder="user.create" onChange={(e) => upd({ action: e.target.value })} />}
        </FormField>
        <FormField label={t('admin.audit.entityType')} className="w-44">
          {(id) => <Input id={id} dir="ltr" value={f.entityType} placeholder="Role" onChange={(e) => upd({ entityType: e.target.value })} />}
        </FormField>
        <FormField label={t('admin.audit.entityId')} className="w-44">
          {(id) => <Input id={id} dir="ltr" value={f.entityId} onChange={(e) => upd({ entityId: e.target.value })} />}
        </FormField>
      </FilterBar>

      {list.error ? (
        <ErrorBlock message={errorMessage(list.error)} onRetry={() => void list.refetch()} />
      ) : (
        <DataTable<AuditRow>
          testId="audit"
          rows={list.data?.items}
          rowKey={(r) => r.id}
          loading={list.isFetching}
          page={page}
          pageSize={PAGE_SIZE}
          total={list.data?.total ?? 0}
          onPageChange={setPage}
          onRowClick={setRow}
          columns={[
            { key: 'createdAt', header: t('admin.audit.time'), cell: (r) => <DateText value={r.createdAt} mode="dayTime" /> },
            {
              key: 'action',
              header: t('admin.audit.action'),
              primary: true,
              cell: (r) => (
                <span className="block">
                  <Code className="text-xs font-medium">{r.action}</Code>
                  {actionLabel(r.action) && <span className="block text-xs text-ink-3">{actionLabel(r.action)}</span>}
                </span>
              ),
            },
            { key: 'actor', header: t('admin.audit.actor'), cell: (r) => r.actorLabel ?? r.actorType },
            {
              key: 'entity',
              header: t('admin.audit.entity'),
              cell: (r) => (
                <span className="block">
                  <span dir="ltr" className="text-sm">{r.entityType}</span>
                  {r.entityId && <Code className="block text-[11px] text-ink-3">{r.entityId.slice(0, 12)}</Code>}
                </span>
              ),
            },
          ]}
        />
      )}

      <Drawer open={!!row} onClose={() => setRow(null)} width="lg" title={t('admin.audit.details')}>
        {row && (
          <div className="space-y-4">
            <DL cols={2}>
              <DLItem label={t('admin.audit.time')}><DateText value={row.createdAt} mode="dayTime" /></DLItem>
              <DLItem label={t('admin.audit.actor')}>
                {row.actorLabel ?? '-'} <Badge size="sm">{row.actorType}</Badge>
              </DLItem>
              <DLItem label={t('admin.audit.action')}><Code>{row.action}</Code></DLItem>
              <DLItem label={t('admin.audit.entity')}>
                <span dir="ltr">{row.entityType}</span> {row.entityId && <Code>{row.entityId}</Code>}
              </DLItem>
              {row.ip && <DLItem label={t('admin.audit.ip')}><Code>{row.ip}</Code></DLItem>}
            </DL>
            <Json label={t('admin.audit.before')} value={row.before} />
            <Json label={t('admin.audit.after')} value={row.after} />
            <Json label={t('admin.audit.meta')} value={row.meta} />
          </div>
        )}
      </Drawer>
    </Page>
  );
}
