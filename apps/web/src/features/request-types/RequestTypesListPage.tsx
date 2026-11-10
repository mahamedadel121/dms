'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { FileStack, Plus } from 'lucide-react';
import type { RequestTypeDto } from '@dms/shared';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { ActiveBadge, Badge, Button, Code, DataTable, ErrorBlock, Icon, Num, Page, PageHeader, StatusChip, useLookup, type Column } from '@/components/ui';

export function RequestTypesListPage() {
  const { t, name } = useT();
  const { can } = useAuth();
  const router = useRouter();
  const canManage = can('request_types.manage');
  const q = useQuery({
    queryKey: ['request-types', 'stats'],
    queryFn: () => api.get<RequestTypeDto[]>('/request-types', { withStats: 1 }),
    enabled: canManage,
  });
  const depts = useLookup('departments');
  const deptName = useMemo(() => new Map((depts.data ?? []).map((d) => [d.id, d.label])), [depts.data]);

  const channels = (r: RequestTypeDto) => (
    <span className="flex flex-wrap gap-1">
      {r.channels.includes('TELEGRAM') && <Badge size="sm" tone="blue">{t('rt.channel.TELEGRAM')}</Badge>}
      {r.channels.includes('WEB') && <Badge size="sm" tone="gray">{t('rt.channel.WEB')}</Badge>}
    </span>
  );
  const workflow = (r: RequestTypeDto) =>
    r.stats?.activeWorkflowVersion ? (
      <StatusChip kind="version" status="ACTIVE" label={`v${r.stats.activeWorkflowVersion}`} size="sm" />
    ) : (
      <Badge size="sm" tone="gray">{t('rt.noActiveWorkflow')}</Badge>
    );

  const columns: Column<RequestTypeDto>[] = [
    {
      key: 'name',
      header: t('rt.col.name'),
      primary: true,
      cell: (r) => (
        <div>
          <div className="font-medium text-ink">{r.nameAr}</div>
          <div className="text-xs text-ink-3" dir="ltr">{r.nameEn}</div>
        </div>
      ),
    },
    { key: 'code', header: t('common.code'), cell: (r) => <Code>{r.code}</Code> },
    { key: 'prefix', header: t('rt.col.prefix'), cell: (r) => <Code>{r.numberPrefix}</Code>, hideOnMobile: true },
    { key: 'dept', header: t('rt.col.department'), cell: (r) => (r.departmentId ? deptName.get(r.departmentId) ?? '' : '—'), hideOnMobile: true },
    { key: 'channels', header: t('rt.col.channels'), cell: channels },
    { key: 'cats', header: t('rt.col.categories'), align: 'end', cell: (r) => <Num value={r.stats?.categoryCount ?? 0} />, hideOnMobile: true },
    { key: 'reqs', header: t('rt.col.requests'), align: 'end', cell: (r) => <Num value={r.stats?.requestCount ?? 0} />, hideOnMobile: true },
    { key: 'wf', header: t('rt.col.workflow'), cell: workflow },
    { key: 'active', header: t('rt.col.status'), cell: (r) => <ActiveBadge active={r.isActive} /> },
  ];

  return (
    <Page testId="page-admin-request-types" width="wide">
      <PageHeader
        title={t('rt.title')}
        subtitle={t('rt.subtitle')}
        actions={
          canManage && (
            <Link href="/admin/request-types/new">
              <Button icon={<Icon as={Plus} size={16} />} data-testid="rt-new">{t('rt.new')}</Button>
            </Link>
          )
        }
      />
      {q.isError && <ErrorBlock message={errorMessage(q.error)} onRetry={() => void q.refetch()} />}
      <DataTable
        testId="rt"
        columns={columns}
        rows={q.data}
        rowKey={(r) => r.code}
        loading={q.isLoading}
        onRowClick={(r) => router.push(`/admin/request-types/${r.id}`)}
        emptyTitle={t('rt.empty')}
        emptyHint={t('rt.emptyHint')}
        emptyIcon={<Icon as={FileStack} size={24} />}
        mobileCard={(r) => (
          <div className="space-y-1.5">
            <div className="text-sm font-medium text-ink">{name(r)}</div>
            <div className="text-xs text-ink-3"><Code>{r.code}</Code> · <Code>{r.numberPrefix}</Code></div>
            <div className="flex flex-wrap items-center gap-2">
              {channels(r)}
              {workflow(r)}
              <ActiveBadge active={r.isActive} />
            </div>
          </div>
        )}
      />
    </Page>
  );
}
