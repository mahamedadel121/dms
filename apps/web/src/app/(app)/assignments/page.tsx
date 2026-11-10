'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftRight, Plus, Unlink } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import {
  Avatar, Badge, Banner, Button, Card, Code, ConfirmDialog, DataTable, DateText, ErrorBlock, FormField, Icon, LookupSelect, Modal, Page, PageHeader, SkeletonCard,
  Tabs, Textarea, useToast, type BadgeTone,
} from '@/components/ui';

interface Assignment {
  id: string;
  submitterId: string;
  submitterName: string;
  submitterCode: string;
  vehicleId: string;
  vehicleNumber: string;
  validFrom: string;
  validTo: string | null;
  source: 'MANUAL' | 'CHANGE_REQUEST' | 'IMPORT';
  note: string | null;
}
interface Current {
  assignments: Assignment[];
  unassignedVehicles: { id: string; number: string; status: string }[];
  stoppedVehicles: { id: string; number: string; status: string }[];
  driversWithoutVehicle: { id: string; code: string; fullName: string }[];
}

const TONE: Record<string, BadgeTone> = { ACTIVE: 'green', STOPPED: 'red', UNDER_MAINTENANCE: 'amber' };

export default function AssignmentsPage() {
  const { t } = useT();
  const { can } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const canManage = can('assignments.manage');

  const [tab, setTab] = useState('current');
  const [submitterId, setSubmitterId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [dlg, setDlg] = useState<{ submitterId: string; vehicleId: string; note: string; lockDriver: boolean } | null>(null);
  const [closing, setClosing] = useState<Assignment | null>(null);

  const current = useQuery({ queryKey: ['assignments', 'current'], queryFn: () => api.get<Current>('/assignments/current') });
  const history = useQuery({
    queryKey: ['assignments', 'history', submitterId, vehicleId],
    queryFn: () => api.get<Assignment[]>('/assignments', { submitterId, vehicleId }),
    enabled: tab === 'history',
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ['assignments'] });

  const save = useMutation({
    mutationFn: () => api.post('/assignments', { submitterId: dlg!.submitterId, vehicleId: dlg!.vehicleId, note: dlg!.note.trim() || null }),
    onSuccess: () => {
      toast.success(t('master.assign.saved'));
      setDlg(null);
      void refresh();
    },
    onError: (e) => toast.error(e),
  });
  const close = useMutation({
    mutationFn: (a: Assignment) => api.post(`/assignments/${a.id}/close`),
    onSuccess: () => {
      toast.success(t('master.assign.saved'));
      setClosing(null);
      void refresh();
    },
    onError: (e) => toast.error(e),
  });

  const cur = current.data;
  const vehicleStatusBadge = (s: string) => <Badge tone={TONE[s] ?? 'gray'}>{t(`master.vehicles.st.${s}`)}</Badge>;

  return (
    <Page testId="page-assignments">
      <PageHeader
        title={t('master.assign.title')}
        subtitle={t('master.assign.subtitle')}
        actions={canManage && <Button icon={<Icon as={Plus} size={16} />} onClick={() => setDlg({ submitterId: '', vehicleId: '', note: '', lockDriver: false })}>{t('master.assign.new')}</Button>}
      />
      <Banner tone="info">{t('inbox.assignments.rule')}</Banner>
      <Tabs value={tab} onChange={setTab} items={[{ key: 'current', label: t('master.assign.tabCurrent') }, { key: 'history', label: t('master.assign.tabHistory') }]} />

      {tab === 'current' && (
        <div className="space-y-4">
          {current.isLoading && <SkeletonCard lines={4} />}
          {current.error && <ErrorBlock message={errorMessage(current.error)} />}
          {cur && (
            <>
              <Card padded={false}>
                <DataTable<Assignment>
                  rows={cur.assignments}
                  rowKey={(r) => r.id}
                  columns={[
                    { key: 'submitterName', header: t('master.assign.driver'), primary: true, cell: (r) => <span className="inline-flex items-center gap-2"><Avatar name={r.submitterName} size={24} /><span>{r.submitterName}</span> <Code className="text-xs text-ink-3">{r.submitterCode}</Code></span> },
                    { key: 'vehicleNumber', header: t('master.assign.vehicle'), cell: (r) => <Code className="font-medium">{r.vehicleNumber}</Code> },
                    { key: 'validFrom', header: t('master.assign.since'), cell: (r) => <DateText value={r.validFrom} mode="dayTime" /> },
                    { key: 'source', header: t('master.assign.source'), hideOnMobile: true, cell: (r) => t(`master.assign.src.${r.source}`) },
                  ]}
                  rowActions={
                    canManage
                      ? (r) => (
                          <>
                            <Button size="sm" variant="secondary" icon={<Icon as={ArrowLeftRight} size={16} />} onClick={() => setDlg({ submitterId: r.submitterId, vehicleId: '', note: '', lockDriver: true })}>
                              {t('master.assign.change')}
                            </Button>
                            <Button size="sm" variant="danger-outline" icon={<Icon as={Unlink} size={16} />} onClick={() => setClosing(r)}>
                              {t('master.assign.close')}
                            </Button>
                          </>
                        )
                      : undefined
                  }
                />
              </Card>
              <div className="grid gap-4 lg:grid-cols-3">
                <Card title={`${t('master.assign.stopped')} (${cur.stoppedVehicles.length})`}>
                  <ul className="space-y-1 text-sm">
                    {cur.stoppedVehicles.map((v) => <li key={v.id} className="flex justify-between"><Code className="font-medium">{v.number}</Code>{vehicleStatusBadge(v.status)}</li>)}
                    {cur.stoppedVehicles.length === 0 && <li className="text-ink-3">-</li>}
                  </ul>
                </Card>
                <Card title={`${t('master.assign.unassigned')} (${cur.unassignedVehicles.length})`}>
                  <ul className="space-y-1 text-sm">
                    {cur.unassignedVehicles.map((v) => (
                      <li key={v.id} className="flex items-center justify-between">
                        <Code className="font-medium">{v.number}</Code>
                        <span className="flex items-center gap-2">
                          {vehicleStatusBadge(v.status)}
                          {canManage && v.status === 'ACTIVE' && (
                            <Button size="sm" variant="ghost" onClick={() => setDlg({ submitterId: '', vehicleId: v.id, note: '', lockDriver: false })}>{t('master.assign.new')}</Button>
                          )}
                        </span>
                      </li>
                    ))}
                    {cur.unassignedVehicles.length === 0 && <li className="text-ink-3">-</li>}
                  </ul>
                </Card>
                <Card title={`${t('master.assign.noDriver')} (${cur.driversWithoutVehicle.length})`}>
                  <ul className="space-y-1 text-sm">
                    {cur.driversWithoutVehicle.map((d) => (
                      <li key={d.id} className="flex items-center justify-between">
                        <span>{d.fullName}</span>
                        {canManage && <Button size="sm" variant="ghost" onClick={() => setDlg({ submitterId: d.id, vehicleId: '', note: '', lockDriver: true })}>{t('master.assign.new')}</Button>}
                      </li>
                    ))}
                    {cur.driversWithoutVehicle.length === 0 && <li className="text-ink-3">-</li>}
                  </ul>
                </Card>
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'history' && (
        <Card padded={false}>
          <div className="grid gap-2 border-b border-hairline p-3 sm:grid-cols-2">
            <LookupSelect entity="submitters" value={submitterId} placeholder={t('master.assign.filterDriver')} onChange={setSubmitterId} />
            <LookupSelect entity="vehicles" value={vehicleId} placeholder={t('master.assign.filterVehicle')} onChange={setVehicleId} />
          </div>
          {history.error ? (
            <div className="p-4"><ErrorBlock message={errorMessage(history.error)} /></div>
          ) : (
            <DataTable<Assignment>
              rows={history.data}
              rowKey={(r) => r.id}
              loading={history.isFetching}
              columns={[
                { key: 'submitterName', header: t('master.assign.driver'), primary: true },
                { key: 'vehicleNumber', header: t('master.assign.vehicle'), cell: (r) => <Code className="font-medium">{r.vehicleNumber}</Code> },
                { key: 'validFrom', header: t('master.assign.from'), cell: (r) => <DateText value={r.validFrom} mode="dayTime" /> },
                { key: 'validTo', header: t('master.assign.to'), cell: (r) => (r.validTo ? <DateText value={r.validTo} mode="dayTime" /> : <Badge tone="green">{t('master.assign.open')}</Badge>) },
                { key: 'source', header: t('master.assign.source'), hideOnMobile: true, cell: (r) => t(`master.assign.src.${r.source}`) },
                { key: 'note', header: t('master.assign.note'), hideOnMobile: true, cell: (r) => r.note ?? '' },
              ]}
            />
          )}
        </Card>
      )}

      <Modal
        open={!!dlg}
        onClose={() => setDlg(null)}
        title={dlg?.lockDriver ? t('master.assign.change') : t('master.assign.new')}
        footer={
          <>
            <Button loading={save.isPending} disabled={!dlg?.submitterId || !dlg?.vehicleId} onClick={() => save.mutate()}>{t('common.save')}</Button>
            <Button variant="secondary" onClick={() => setDlg(null)}>{t('common.cancel')}</Button>
          </>
        }
      >
        {dlg && (
          <div className="space-y-4">
            <FormField label={t('master.assign.driver')} required>
              {(id) => <LookupSelect id={id} entity="submitters" value={dlg.submitterId} disabled={dlg.lockDriver} onChange={(v) => setDlg({ ...dlg, submitterId: v })} />}
            </FormField>
            <FormField label={t('master.assign.vehicle')} required>
              {(id) => <LookupSelect id={id} entity="vehicles" value={dlg.vehicleId} onChange={(v) => setDlg({ ...dlg, vehicleId: v })} />}
            </FormField>
            <FormField label={t('master.assign.note')}>{(id) => <Textarea id={id} value={dlg.note} onChange={(e) => setDlg({ ...dlg, note: e.target.value })} />}</FormField>
          </div>
        )}
      </Modal>
      <ConfirmDialog open={!!closing} onClose={() => setClosing(null)} danger title={t('master.assign.close')} message={t('master.assign.closeBody')} loading={close.isPending} onConfirm={() => closing && close.mutate(closing)} />
    </Page>
  );
}
