'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Plus } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { formatDateTime } from '@/lib/format';
import {
  Badge, Button, Card, Checkbox, ConfirmDialog, DataTable, ErrorBlock, FormField, Input, LookupSelect, Modal, PageHeader, Textarea,
  fieldErrorsFromApi, requiredErrors, useToast, type BadgeTone,
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

const TONE: Record<Delegation['status'], BadgeTone> = { UPCOMING: 'blue', ACTIVE: 'green', EXPIRED: 'gray', REVOKED: 'red' };

/** `datetime-local` value (wall clock in the browser) -> ISO */
const toIso = (v: string) => new Date(v).toISOString();

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
        startsAt: toIso(form.startsAt),
        endsAt: toIso(form.endsAt),
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
    if (new Date(form.endsAt) <= new Date(form.startsAt)) return setErrors({ endsAt: t('common.invalidNumber') });
    create.mutate();
  }

  return (
    <>
      <PageHeader
        title={t('admin.deleg.title')}
        subtitle={t('admin.deleg.subtitle')}
        actions={
          <>
            {all && <Checkbox label={t('admin.deleg.mineOnly')} checked={mine} onChange={setMine} />}
            <Button
              icon={<Plus className="h-4 w-4" />}
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
      <Card padded={false}>
        {list.error ? (
          <div className="p-4"><ErrorBlock message={errorMessage(list.error)} /></div>
        ) : (
          <DataTable<Delegation>
            rows={list.data}
            rowKey={(r) => r.id}
            loading={list.isFetching}
            columns={[
              { key: 'from', header: t('admin.deleg.from'), primary: true, cell: (r) => r.fromUserName },
              { key: 'to', header: t('admin.deleg.to'), cell: (r) => r.toUserName },
              { key: 'role', header: t('admin.deleg.role'), cell: (r) => r.roleName ?? t('admin.deleg.allRoles') },
              { key: 'startsAt', header: t('admin.deleg.starts'), cell: (r) => formatDateTime(r.startsAt) },
              { key: 'endsAt', header: t('admin.deleg.ends'), cell: (r) => formatDateTime(r.endsAt) },
              { key: 'reason', header: t('admin.deleg.reason'), hideOnMobile: true, cell: (r) => r.reason ?? '' },
              { key: 'status', header: t('common.status'), cell: (r) => <Badge tone={TONE[r.status]}>{t(`admin.deleg.st.${r.status}`)}</Badge> },
            ]}
            rowActions={(r) =>
              (r.status === 'ACTIVE' || r.status === 'UPCOMING') && (r.fromUserId === me?.id || all) ? (
                <Button size="sm" variant="ghost" icon={<Ban className="h-4 w-4" />} title={t('admin.deleg.revoke')} aria-label={t('admin.deleg.revoke')} onClick={() => setRevoke(r)} />
              ) : null
            }
          />
        )}
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t('admin.deleg.new')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
            <Button loading={create.isPending} onClick={submit}>{t('common.save')}</Button>
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
              {(id) => <Input id={id} type="datetime-local" value={form.startsAt} invalid={!!errors.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} />}
            </FormField>
            <FormField label={t('admin.deleg.ends')} required error={errors.endsAt}>
              {(id) => <Input id={id} type="datetime-local" value={form.endsAt} invalid={!!errors.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} />}
            </FormField>
          </div>
          <FormField label={t('admin.deleg.reason')}>{(id) => <Textarea id={id} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />}</FormField>
        </div>
      </Modal>
      <ConfirmDialog open={!!revoke} onClose={() => setRevoke(null)} danger title={t('admin.deleg.revoke')} message={t('admin.deleg.revokeBody')} loading={doRevoke.isPending} onConfirm={() => revoke && doRevoke.mutate(revoke)} />
    </>
  );
}
