'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDateTime } from '@/lib/format';
import { Badge, Card, ErrorBlock, PageHeader, Tabs } from '@/components/ui/Display';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Button } from '@/components/ui/Button';
import { FormField, Textarea } from '@/components/ui/Fields';
import { LookupSelect } from '@/components/ui/Inputs2';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useTr } from '../common/useTr';
import type { PagedResult, VehicleChangeRow } from '../types';

const tone = { PENDING: 'amber', APPROVED: 'green', REJECTED: 'red', CANCELLED: 'gray' } as const;

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

  const columns: Column<VehicleChangeRow>[] = [
    { key: 'submitterName', header: t('requests.vcr.driver'), primary: true },
    { key: 'from', header: t('requests.vcr.from'), cell: (r) => r.fromVehicleNumber ?? '—' },
    { key: 'to', header: t('requests.vcr.to'), cell: (r) => r.toVehicleNumber ?? r.requestedVehicleText ?? '—' },
    { key: 'createdAt', header: t('requests.vcr.createdAt'), cell: (r) => formatDateTime(r.createdAt) },
    {
      key: 'status',
      header: t('common.status'),
      cell: (r) => (
        <span>
          <Badge tone={tone[r.status]}>{t(`requests.vcr.status.${r.status}`)}</Badge>
          {r.decidedByName && <span className="ms-2 text-xs text-slate-500">{r.decidedByName}</span>}
        </span>
      ),
    },
  ];

  const needsVehicle = !!dlg && dlg.kind === 'approve' && !dlg.row.toVehicleId;

  return (
    <div>
      <PageHeader title={t('requests.vcr.title')} subtitle={t('requests.vcr.subtitle')} />
      <Tabs
        className="mb-3"
        value={tab}
        onChange={(k) => setTab(k as 'PENDING' | 'ALL')}
        items={[
          { key: 'PENDING', label: t('requests.vcr.tabPending') },
          { key: 'ALL', label: t('requests.vcr.tabAll') },
        ]}
      />
      {q.isError && <ErrorBlock message={(q.error as Error).message} />}
      <Card padded={false}>
        <DataTable
          columns={columns}
          rows={q.data}
          rowKey={(r) => r.id}
          loading={q.isFetching}
          rowActions={
            can('vehicle_changes.decide')
              ? (r) =>
                  r.status === 'PENDING' ? (
                    <>
                      <Button size="sm" icon={<Check className="h-4 w-4" />} onClick={() => open(r, 'approve')}>
                        {t('requests.vcr.approve')}
                      </Button>
                      <Button size="sm" variant="danger" icon={<X className="h-4 w-4" />} onClick={() => open(r, 'reject')}>
                        {t('requests.vcr.reject')}
                      </Button>
                    </>
                  ) : null
              : undefined
          }
        />
      </Card>

      <Modal
        open={!!dlg}
        onClose={() => setDlg(null)}
        title={dlg?.kind === 'approve' ? t('requests.vcr.approveTitle') : t('requests.vcr.rejectTitle')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDlg(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant={dlg?.kind === 'reject' ? 'danger' : 'primary'}
              loading={decide.isPending}
              disabled={needsVehicle && !toVehicleId}
              onClick={() => dlg && decide.mutate(dlg)}
            >
              {dlg?.kind === 'approve' ? t('requests.vcr.approve') : t('requests.vcr.reject')}
            </Button>
          </>
        }
      >
        {dlg && (
          <div className="space-y-3">
            <p className="text-sm">
              <b>{dlg.row.submitterName}</b>: {dlg.row.fromVehicleNumber ?? '—'} → {dlg.row.toVehicleNumber ?? dlg.row.requestedVehicleText ?? '—'}
            </p>
            {needsVehicle && (
              <FormField label={t('requests.vcr.to')} required>
                {(id) => <LookupSelect id={id} entity="vehicles" value={toVehicleId} onChange={setToVehicleId} />}
              </FormField>
            )}
            <FormField label={t('requests.vcr.comment')}>{(id) => <Textarea id={id} value={comment} onChange={(e) => setComment(e.target.value)} />}</FormField>
          </div>
        )}
      </Modal>
    </div>
  );
}
