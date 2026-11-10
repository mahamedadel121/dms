'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Ban, Check, Clock3, X, type LucideIcon } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import {
  Avatar, Badge, Button, Code, DataTable, DateText, ErrorBlock, FormField, Icon, LookupSelect, Modal, Page, PageHeader, Tabs, Textarea, useToast,
  type BadgeTone, type Column,
} from '@/components/ui';
import { useTr } from '../common/useTr';
import type { PagedResult, VehicleChangeRow } from '../types';

const VCR_TONE: Record<VehicleChangeRow['status'], BadgeTone> = { PENDING: 'amber', APPROVED: 'green', REJECTED: 'red', CANCELLED: 'gray' };
const VCR_ICON: Record<VehicleChangeRow['status'], LucideIcon> = { PENDING: Clock3, APPROVED: Check, REJECTED: X, CANCELLED: Ban };

function VehicleFlow({ row }: { row: VehicleChangeRow }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {row.fromVehicleNumber ? <Code>{row.fromVehicleNumber}</Code> : <span className="text-ink-3">—</span>}
      <Icon as={ArrowRight} mirror size={16} className="text-ink-3" />
      {row.toVehicleNumber ? (
        <Code>{row.toVehicleNumber}</Code>
      ) : row.requestedVehicleText ? (
        <Badge tone="amber">{row.requestedVehicleText}</Badge>
      ) : (
        <span className="text-ink-3">—</span>
      )}
    </span>
  );
}

export function VehicleChangesPage() {
  const { t } = useTr();
  const { can } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<'PENDING' | 'ALL'>('PENDING');
  const [dlg, setDlg] = useState<{ row: VehicleChangeRow; kind: 'approve' | 'reject' } | null>(null);
  const [comment, setComment] = useState('');
  const [toVehicleId, setToVehicleId] = useState('');

  const q = useQuery({
    queryKey: ['vehicle-changes', tab],
    queryFn: async () => {
      const r = await api.get<PagedResult<VehicleChangeRow> | VehicleChangeRow[]>('/vehicle-change-requests', { status: tab === 'PENDING' ? 'PENDING' : '' });
      return Array.isArray(r) ? r : r.items;
    },
  });

  const decide = useMutation({
    mutationFn: ({ row, kind }: { row: VehicleChangeRow; kind: 'approve' | 'reject' }) =>
      api.post(`/vehicle-change-requests/${row.id}/${kind}`, { comment: comment.trim() || undefined, toVehicleId: kind === 'approve' && toVehicleId ? toVehicleId : undefined }),
    onSuccess: (_d, v) => {
      toast.success(t(v.kind === 'approve' ? 'requests.vcr.approved' : 'requests.vcr.rejected'));
      setDlg(null);
      void qc.invalidateQueries({ queryKey: ['vehicle-changes'] });
    },
    onError: (e) => toast.error(e),
  });

  const open = (row: VehicleChangeRow, kind: 'approve' | 'reject') => {
    setComment('');
    setToVehicleId('');
    setDlg({ row, kind });
  };

  const statusChip = (r: VehicleChangeRow) => (
    <span className="inline-flex items-center gap-2">
      <Badge tone={VCR_TONE[r.status]} icon={<Icon as={VCR_ICON[r.status]} size={14} />}>
        {t(`requests.vcr.status.${r.status}`)}
      </Badge>
      {r.decidedByName && <span className="text-xs text-ink-3">{r.decidedByName}</span>}
    </span>
  );

  const columns: Column<VehicleChangeRow>[] = [
    {
      key: 'submitterName',
      header: t('requests.vcr.driver'),
      primary: true,
      cell: (r) => (
        <span className="inline-flex items-center gap-2">
          <Avatar name={r.submitterName} size={24} />
          <span>{r.submitterName}</span>
        </span>
      ),
    },
    { key: 'vehicles', header: `${t('requests.vcr.from')} / ${t('requests.vcr.to')}`, cell: (r) => <VehicleFlow row={r} /> },
    { key: 'createdAt', header: t('requests.vcr.createdAt'), cell: (r) => <DateText value={r.createdAt} mode="relative" /> },
    { key: 'status', header: t('common.status'), cell: statusChip },
  ];

  const needsVehicle = !!dlg && dlg.kind === 'approve' && !dlg.row.toVehicleId;

  const actions = can('vehicle_changes.decide')
    ? (r: VehicleChangeRow) =>
        r.status === 'PENDING' ? (
          <>
            <Button size="sm" icon={<Icon as={Check} size={16} />} onClick={() => open(r, 'approve')}>
              {t('requests.vcr.approve')}
            </Button>
            <Button size="sm" variant="danger-outline" icon={<Icon as={X} size={16} />} onClick={() => open(r, 'reject')}>
              {t('requests.vcr.reject')}
            </Button>
          </>
        ) : null
    : undefined;

  return (
    <Page testId="page-vehicle-changes">
      <PageHeader title={t('requests.vcr.title')} subtitle={t('requests.vcr.subtitle')} />
      <Tabs
        value={tab}
        onChange={(k) => setTab(k as 'PENDING' | 'ALL')}
        items={[
          { key: 'PENDING', label: t('requests.vcr.tabPending') },
          { key: 'ALL', label: t('requests.vcr.tabAll') },
        ]}
      />
      {q.isError && <ErrorBlock message={(q.error as Error).message} onRetry={() => void q.refetch()} />}
      <DataTable
        testId="vehicle-changes"
        columns={columns}
        rows={q.data}
        rowKey={(r) => r.id}
        loading={q.isFetching}
        rowActions={actions}
        mobileCard={(r) => (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{r.submitterName}</span>
              <DateText value={r.createdAt} mode="relative" className="text-xs text-ink-3" />
            </div>
            <VehicleFlow row={r} />
            <div>{statusChip(r)}</div>
          </div>
        )}
      />

      <Modal
        open={!!dlg}
        onClose={() => setDlg(null)}
        title={dlg?.kind === 'approve' ? t('requests.vcr.approveTitle') : t('requests.vcr.rejectTitle')}
        footer={
          <>
            <Button
              variant={dlg?.kind === 'reject' ? 'danger' : 'primary'}
              loading={decide.isPending}
              disabled={needsVehicle && !toVehicleId}
              onClick={() => dlg && decide.mutate(dlg)}
            >
              {dlg?.kind === 'approve' ? t('requests.vcr.approve') : t('requests.vcr.reject')}
            </Button>
            <Button variant="secondary" onClick={() => setDlg(null)}>
              {t('common.cancel')}
            </Button>
          </>
        }
      >
        {dlg && (
          <div className="space-y-3">
            <p className="text-sm">
              <b>{dlg.row.submitterName}</b>
            </p>
            <VehicleFlow row={dlg.row} />
            {needsVehicle && (
              <FormField label={t('requests.vcr.to')} required>
                {(id) => <LookupSelect id={id} entity="vehicles" value={toVehicleId} onChange={setToVehicleId} />}
              </FormField>
            )}
            <FormField label={t('requests.vcr.comment')}>{(id) => <Textarea id={id} value={comment} onChange={(e) => setComment(e.target.value)} />}</FormField>
          </div>
        )}
      </Modal>
    </Page>
  );
}
