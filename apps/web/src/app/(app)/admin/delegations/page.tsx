'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Ban, Plus } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { cairoDayToIso } from '@/lib/format';
import { delegationStatus } from '@/features/admin/delegation';
import {
  Avatar, Button, Checkbox, ConfirmDialog, DataTable, DateField, DateText, ErrorBlock, FormField, Icon, IconButton, LookupSelect, Modal, Page, PageHeader,
  StatusChip, Textarea, fieldErrorsFromApi, requiredErrors, useToast,
} from '@/components/ui';

interface Delegation {
  id: string;
  fromUserId: string;
  fromUserName: string;
  toUserId: string;
  toUserName: string;
  roleId: string | null;
  roleName: string | null;
  startsAt: string;
  endsAt: string;
  reason: string | null;
  status: 'UPCOMING' | 'ACTIVE' | 'EXPIRED' | 'REVOKED';
}

/** The API only reports a REVOKED status; the model gets a `revokedAt` marker so REVOKED wins. */
const statusOf = (d: Delegation) => delegationStatus({ startsAt: d.startsAt, endsAt: d.endsAt, revokedAt: d.status === 'REVOKED' ? d.endsAt : null });

export default function DelegationsPage() {
  const { t } = useT();
  const { can, me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const all = can('delegations.manage_all');
  const [mine, setMine] = useState(!all);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ toUserId: '', roleId: '', startsAt: '', endsAt: '', reason: '', fromUserId: '' });
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [revoke, setRevoke] = useState<Delegation | null>(null);

  const list = useQuery({ queryKey: ['delegations', mine], queryFn: () => api.get<Delegation[]>('/delegations', { mine: mine ? 1 : undefined }) });
  const reload = () => qc.invalidateQueries({ queryKey: ['delegations'] });

  const create = useMutation({
    mutationFn: () =>
      api.post('/delegations', {
        toUserId: form.toUserId,
        roleId: form.roleId || null,
        startsAt: cairoDayToIso(form.startsAt),
        endsAt: cairoDayToIso(form.endsAt, true),
        reason: form.reason.trim() || null,
        ...(all && form.fromUserId ? { fromUserId: form.fromUserId } : {}),
      }),
    onSuccess: () => {
      toast.success(t('admin.deleg.created'));
      setOpen(false);
      void reload();
    },
    onError: (e) => {
      setErrors(fieldErrorsFromApi(e));
      toast.error(e);
    },
  });
  const doRevoke = useMutation({
    mutationFn: (d: Delegation) => api.post(`/delegations/${d.id}/revoke`),
    onSuccess: () => {
      toast.success(t('admin.deleg.revoked'));
      setRevoke(null);
      void reload();
    },
    onError: (e) => toast.error(e),
  });

  function submit() {
    const missing = requiredErrors(form, ['toUserId', 'startsAt', 'endsAt'], t('common.fieldRequired'));
    if (Object.keys(missing).length) return setErrors(missing);
    if (form.endsAt < form.startsAt) return setErrors({ endsAt: t('common.invalidNumber') });
    create.mutate();
  }

  const person = (n: string) => (
    <span className="flex items-center gap-2">
      <Avatar name={n} size={24} />
      <span>{n}</span>
    </span>
  );

  return (
    <Page testId="page-admin-delegations">
      <PageHeader
        title={t('admin.deleg.title')}
        subtitle={t('admin.deleg.subtitle')}
        actions={
          <>
            {all && <Checkbox label={t('admin.deleg.mineOnly')} checked={mine} onChange={setMine} />}
            <Button
              icon={<Icon as={Plus} size={16} />}
              onClick={() => {
                setErrors({});
                setForm({ toUserId: '', roleId: '', startsAt: '', endsAt: '', reason: '', fromUserId: '' });
                setOpen(true);
              }}
            >
              {t('admin.deleg.new')}
            </Button>
          </>
        }
      />
      {list.error ? (
        <ErrorBlock message={errorMessage(list.error)} onRetry={() => void list.refetch()} />
      ) : (
        <DataTable<Delegation>
          testId="delegations"
          rows={list.data}
          rowKey={(r) => r.id}
          loading={list.isFetching}
          columns={[
            { key: 'from', header: t('admin.deleg.from'), primary: true, cell: (r) => person(r.fromUserName) },
            { key: 'to', header: t('admin.deleg.to'), cell: (r) => person(r.toUserName) },
            { key: 'role', header: t('admin.deleg.role'), cell: (r) => r.roleName ?? t('admin.deleg.allRoles') },
            {
              key: 'period',
              header: t('admin.deleg.period'),
              cell: (r) => (
                <span className="inline-flex items-center gap-1.5">
                  <DateText value={r.startsAt} mode="day" />
                  <Icon as={ArrowRight} size={14} mirror className="text-ink-3" />
                  <DateText value={r.endsAt} mode="day" />
                </span>
              ),
            },
            { key: 'reason', header: t('admin.deleg.reason'), hideOnMobile: true, cell: (r) => r.reason ?? '' },
            {
              key: 'status',
              header: t('common.status'),
              cell: (r) => {
                const st = statusOf(r);
                return <StatusChip kind="delegation" status={st} label={t(`admin.deleg.st.${st}`)} />;
              },
            },
          ]}
          rowActions={(r) => {
            const st = statusOf(r);
            return (st === 'ACTIVE' || st === 'UPCOMING') && (r.fromUserId === me?.id || all) ? (
              <IconButton icon={<Icon as={Ban} size={18} />} label={t('admin.deleg.revoke')} onClick={() => setRevoke(r)} />
            ) : null;
          }}
        />
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t('admin.deleg.new')}
        footer={
          <>
            <Button loading={create.isPending} onClick={submit}>{t('common.save')}</Button>
            <Button variant="secondary" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
          </>
        }
      >
        <div className="space-y-4">
          {all && (
            <FormField label={t('admin.deleg.onBehalf')}>
              {(id) => <LookupSelect id={id} entity="users" value={form.fromUserId} placeholder={me?.fullName} onChange={(v) => setForm({ ...form, fromUserId: v })} />}
            </FormField>
          )}
          <FormField label={t('admin.deleg.to')} required error={errors.toUserId}>
            {(id) => <LookupSelect id={id} entity="users" value={form.toUserId} invalid={!!errors.toUserId} onChange={(v) => setForm({ ...form, toUserId: v })} />}
          </FormField>
          <FormField label={t('admin.deleg.role')}>
            {(id) => <LookupSelect id={id} entity="roles" value={form.roleId} placeholder={t('admin.deleg.allRoles')} onChange={(v) => setForm({ ...form, roleId: v })} />}
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={t('admin.deleg.starts')} required error={errors.startsAt}>
              {(id) => <DateField id={id} value={form.startsAt} invalid={!!errors.startsAt} onChange={(v) => setForm({ ...form, startsAt: v })} />}
            </FormField>
            <FormField label={t('admin.deleg.ends')} required error={errors.endsAt}>
              {(id) => <DateField id={id} value={form.endsAt} min={form.startsAt || undefined} invalid={!!errors.endsAt} onChange={(v) => setForm({ ...form, endsAt: v })} />}
            </FormField>
          </div>
          <FormField label={t('admin.deleg.reason')}>{(id) => <Textarea id={id} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />}</FormField>
        </div>
      </Modal>
      <ConfirmDialog open={!!revoke} onClose={() => setRevoke(null)} danger title={t('admin.deleg.revoke')} message={t('admin.deleg.revokeBody')} loading={doRevoke.isPending} onConfirm={() => revoke && doRevoke.mutate(revoke)} />
    </Page>
  );
}
