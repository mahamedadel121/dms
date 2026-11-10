'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, LogOut, PenLine, Pencil, Plus, Search, ShieldCheck } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { formatDateTime } from '@/lib/format';
import type { Paged } from '@/lib/types';
import {
  ActiveBadge, Badge, Button, Card, Checkbox, ConfirmDialog, DataTable, ErrorBlock, FormField, Input, LookupMultiSelect, LookupSelect, Modal,
  PageHeader, Select, fieldErrorsFromApi, requiredErrors, useToast,
} from '@/components/ui';
import { SignatureManager } from '@/components/SignatureManager';

interface UserRow {
  id: string;
  username: string;
  fullName: string;
  fullNameEn: string | null;
  phone: string | null;
  email: string | null;
  departmentId: string | null;
  departmentName: string | null;
  locale: string;
  isActive: boolean;
  mustChangePassword: boolean;
  lockedUntil: string | null;
  lastLoginAt: string | null;
  telegramLinked: boolean;
  roleIds: string[];
  roles: { id: string; code: string; nameAr: string; nameEn: string }[];
  hasSignature: boolean;
}

interface Form {
  username: string;
  password: string;
  fullName: string;
  fullNameEn: string;
  phone: string;
  email: string;
  departmentId: string;
  locale: string;
  mustChangePassword: boolean;
  isActive: boolean;
  roleIds: string[];
}

const EMPTY: Form = { username: '', password: '', fullName: '', fullNameEn: '', phone: '', email: '', departmentId: '', locale: 'ar', mustChangePassword: false, isActive: true, roleIds: [] };
const nul = (s: string) => (s.trim() === '' ? null : s.trim());

export default function UsersPage() {
  const { t, name } = useT();
  const { can, me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const canManage = can('users.manage');

  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('');
  const [edit, setEdit] = useState<{ mode: 'create' | 'edit'; user?: UserRow } | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [reset, setReset] = useState<UserRow | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [revoke, setRevoke] = useState<UserRow | null>(null);
  const [sig, setSig] = useState<UserRow | null>(null);

  const list = useQuery({
    queryKey: ['users', page, search, sort],
    queryFn: () => api.get<Paged<UserRow>>('/users', { page, pageSize: 25, q: search, sort }),
    placeholderData: (p) => p,
  });
  const reload = () => qc.invalidateQueries({ queryKey: ['users'] });
  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };

  function open(mode: 'create' | 'edit', user?: UserRow) {
    setErrors({});
    setForm(
      user
        ? { ...EMPTY, username: user.username, fullName: user.fullName, fullNameEn: user.fullNameEn ?? '', phone: user.phone ?? '', email: user.email ?? '', departmentId: user.departmentId ?? '', locale: user.locale, mustChangePassword: user.mustChangePassword, isActive: user.isActive, roleIds: user.roleIds }
        : EMPTY,
    );
    setEdit({ mode, user });
  }

  const save = useMutation({
    mutationFn: async () => {
      if (edit!.mode === 'create') {
        return api.post('/users', {
          username: form.username.trim(),
          password: form.password,
          fullName: form.fullName.trim(),
          fullNameEn: nul(form.fullNameEn),
          phone: nul(form.phone),
          email: nul(form.email),
          departmentId: nul(form.departmentId),
          locale: form.locale,
          mustChangePassword: form.mustChangePassword,
          roleIds: form.roleIds,
        });
      }
      const id = edit!.user!.id;
      await api.patch(`/users/${id}`, {
        fullName: form.fullName.trim(),
        fullNameEn: nul(form.fullNameEn),
        phone: nul(form.phone),
        email: nul(form.email),
        departmentId: nul(form.departmentId),
        locale: form.locale,
        isActive: form.isActive,
        mustChangePassword: form.mustChangePassword,
      });
      const before = [...edit!.user!.roleIds].sort().join(',');
      if (before !== [...form.roleIds].sort().join(',')) await api.put(`/users/${id}/roles`, { roleIds: form.roleIds });
    },
    onSuccess: () => {
      toast.success(t('common.saved'));
      setEdit(null);
      void reload();
    },
    onError: (e) => {
      setErrors(fieldErrorsFromApi(e));
      toast.error(e);
    },
  });

  const doReset = useMutation({
    mutationFn: (u: UserRow) => api.post<{ temporaryPassword: string | null }>(`/users/${u.id}/reset-password`, { mustChangePassword: true }),
    onSuccess: (r) => {
      setReset(null);
      setTempPassword(r.temporaryPassword);
    },
    onError: (e) => toast.error(e),
  });
  const doRevoke = useMutation({
    mutationFn: (u: UserRow) => api.post(`/users/${u.id}/revoke-sessions`),
    onSuccess: () => {
      toast.success(t('admin.users.revoked'));
      setRevoke(null);
    },
    onError: (e) => toast.error(e),
  });

  function submit() {
    const req: (keyof Form)[] = edit!.mode === 'create' ? ['username', 'password', 'fullName'] : ['fullName'];
    const missing = requiredErrors(form as unknown as Record<string, unknown>, req as string[], t('common.fieldRequired'));
    if (Object.keys(missing).length) return setErrors(missing);
    save.mutate();
  }

  return (
    <>
      <PageHeader
        title={t('admin.users.title')}
        subtitle={t('admin.users.subtitle')}
        actions={canManage && <Button icon={<Plus className="h-4 w-4" />} onClick={() => open('create')}>{t('common.create')}</Button>}
      />
      <Card padded={false}>
        <form
          className="flex gap-2 border-b border-slate-100 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setSearch(q.trim());
          }}
        >
          <Input className="flex-1" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('common.searchPlaceholder')} />
          <Button type="submit" variant="secondary" icon={<Search className="h-4 w-4" />}>{t('common.search')}</Button>
        </form>
        {list.error ? (
          <div className="p-4"><ErrorBlock message={errorMessage(list.error)} /></div>
        ) : (
          <DataTable<UserRow>
            rows={list.data?.items}
            rowKey={(r) => r.id}
            loading={list.isFetching}
            page={page}
            pageSize={25}
            total={list.data?.total ?? 0}
            onPageChange={setPage}
            sort={sort}
            onSortChange={setSort}
            columns={[
              { key: 'username', header: t('admin.users.username'), sortable: true, cell: (r) => <bdi className="font-semibold">{r.username}</bdi> },
              { key: 'fullName', header: t('common.name'), sortable: true, primary: true, cell: (r) => r.fullName },
              {
                key: 'roles',
                header: t('admin.users.roles'),
                cell: (r) => (r.roles.length ? <span className="flex flex-wrap gap-1">{r.roles.map((x) => <Badge key={x.id} tone="blue">{name(x)}</Badge>)}</span> : '-'),
              },
              { key: 'lastLoginAt', header: t('admin.users.lastLogin'), sortable: true, hideOnMobile: true, cell: (r) => formatDateTime(r.lastLoginAt) || '-' },
              {
                key: 'status',
                header: t('common.status'),
                cell: (r) => (
                  <span className="flex flex-wrap gap-1">
                    <ActiveBadge active={r.isActive} />
                    {r.lockedUntil && new Date(r.lockedUntil) > new Date() && <Badge tone="red">{t('admin.users.locked')}</Badge>}
                    <Badge tone={r.hasSignature ? 'green' : 'amber'}>{r.hasSignature ? t('admin.users.hasSignature') : t('admin.users.noSignature')}</Badge>
                  </span>
                ),
              },
            ]}
            rowActions={(row) => (
              <>
                {can('signatures.manage') && <Button size="sm" variant="ghost" icon={<PenLine className="h-4 w-4" />} title={t('admin.users.signature')} aria-label={t('admin.users.signature')} onClick={() => setSig(row)} />}
                {canManage && (
                  <>
                    <Button size="sm" variant="ghost" icon={<Pencil className="h-4 w-4" />} title={t('common.edit')} aria-label={t('common.edit')} onClick={() => open('edit', row)} />
                    <Button size="sm" variant="ghost" icon={<KeyRound className="h-4 w-4" />} title={t('admin.users.resetPassword')} aria-label={t('admin.users.resetPassword')} onClick={() => setReset(row)} />
                    <Button size="sm" variant="ghost" icon={<LogOut className="h-4 w-4" />} title={t('admin.users.revokeSessions')} aria-label={t('admin.users.revokeSessions')} onClick={() => setRevoke(row)} />
                  </>
                )}
              </>
            )}
          />
        )}
      </Card>

      <Modal
        open={!!edit}
        onClose={() => setEdit(null)}
        size="lg"
        title={edit?.mode === 'create' ? t('common.create') : `${t('common.edit')} - ${edit?.user?.username ?? ''}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEdit(null)}>{t('common.cancel')}</Button>
            <Button loading={save.isPending} onClick={submit}>{t('common.save')}</Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t('admin.users.username')} required={edit?.mode === 'create'} error={errors.username}>
            {(id) => <Input id={id} dir="ltr" disabled={edit?.mode === 'edit'} value={form.username} invalid={!!errors.username} onChange={(e) => set('username', e.target.value)} />}
          </FormField>
          {edit?.mode === 'create' && (
            <FormField label={t('admin.users.password')} required error={errors.password} hint={t('admin.users.passwordHint')}>
              {(id) => <Input id={id} type="password" dir="ltr" autoComplete="new-password" value={form.password} invalid={!!errors.password} onChange={(e) => set('password', e.target.value)} />}
            </FormField>
          )}
          <FormField label={t('admin.users.fullName')} required error={errors.fullName}>
            {(id) => <Input id={id} value={form.fullName} invalid={!!errors.fullName} onChange={(e) => set('fullName', e.target.value)} />}
          </FormField>
          <FormField label={t('admin.users.fullNameEn')}>{(id) => <Input id={id} dir="ltr" value={form.fullNameEn} onChange={(e) => set('fullNameEn', e.target.value)} />}</FormField>
          <FormField label={t('admin.users.phone')} error={errors.phone}>{(id) => <Input id={id} dir="ltr" value={form.phone} onChange={(e) => set('phone', e.target.value)} />}</FormField>
          <FormField label={t('admin.users.email')} error={errors.email}>{(id) => <Input id={id} type="email" dir="ltr" value={form.email} invalid={!!errors.email} onChange={(e) => set('email', e.target.value)} />}</FormField>
          <FormField label={t('admin.users.department')}>{(id) => <LookupSelect id={id} entity="departments" value={form.departmentId} onChange={(v) => set('departmentId', v)} />}</FormField>
          <FormField label={t('admin.users.locale')}>
            {(id) => <Select id={id} value={form.locale} options={[{ value: 'ar', label: t('common.arabic') }, { value: 'en', label: t('common.english') }]} onChange={(v) => set('locale', v)} />}
          </FormField>
          <div className="flex flex-wrap gap-x-6 gap-y-2 sm:col-span-2">
            <Checkbox label={t('admin.users.mustChange')} checked={form.mustChangePassword} onChange={(c) => set('mustChangePassword', c)} />
            {edit?.mode === 'edit' && <Checkbox label={t('common.active')} checked={form.isActive} disabled={edit.user?.id === me?.id} onChange={(c) => set('isActive', c)} />}
          </div>
          <div className="sm:col-span-2">
            <p className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-slate-700"><ShieldCheck className="h-4 w-4" />{t('admin.users.roles')}</p>
            <LookupMultiSelect entity="roles" value={form.roleIds} onChange={(ids) => set('roleIds', ids)} />
          </div>
          {edit?.mode === 'edit' && (
            <p className="text-xs text-slate-500 sm:col-span-2">
              {t('admin.users.telegram')}: <Badge tone={edit.user?.telegramLinked ? 'green' : 'gray'}>{edit.user?.telegramLinked ? t('admin.users.telegramLinked') : t('admin.users.telegramNone')}</Badge>
              <span className="ms-2">{t('admin.users.telegramNote')}</span>
            </p>
          )}
        </div>
      </Modal>

      <ConfirmDialog open={!!reset} onClose={() => setReset(null)} title={t('admin.users.resetPassword')} message={t('admin.users.resetBody')} danger loading={doReset.isPending} onConfirm={() => reset && doReset.mutate(reset)} />
      <ConfirmDialog open={!!revoke} onClose={() => setRevoke(null)} title={t('admin.users.revokeSessions')} message={t('admin.users.revokeBody')} danger loading={doRevoke.isPending} onConfirm={() => revoke && doRevoke.mutate(revoke)} />
      <Modal open={tempPassword !== null} onClose={() => setTempPassword(null)} size="sm" title={t('admin.users.resetPassword')} footer={<Button onClick={() => setTempPassword(null)}>{t('common.close')}</Button>}>
        <p className="mb-2 text-sm text-slate-600">{t('admin.users.tempPassword')}</p>
        <code dir="ltr" className="block select-all rounded-md bg-slate-100 px-3 py-2 text-center text-lg font-bold tracking-wider">{tempPassword}</code>
      </Modal>
      <Modal open={!!sig} onClose={() => { setSig(null); void reload(); }} size="lg" title={`${t('admin.users.signature')} - ${sig?.fullName ?? ''}`}>
        {sig && <SignatureManager owner="users" ownerId={sig.id} canEdit={can('signatures.manage')} onChanged={() => void reload()} />}
      </Modal>
    </>
  );
}
