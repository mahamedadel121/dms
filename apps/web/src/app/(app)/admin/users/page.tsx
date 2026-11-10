'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, LogOut, MoreHorizontal, PenLine, Pencil, Plus, Send, ShieldCheck, Unlink } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import type { Paged } from '@/lib/types';
import {
  ActiveBadge, Avatar, Badge, Button, Checkbox, Code, ConfirmDialog, DataTable, DateText, ErrorBlock, FormField, Icon, IconButton, Input, LookupMultiSelect,
  LookupSelect, Menu, Modal, Page, PageHeader, SearchInput, Select, fieldErrorsFromApi, requiredErrors, useToast, type MenuItem,
} from '@/components/ui';
import { SignatureManager } from '@/components/SignatureManager';
import { TelegramLinkDialog, type TelegramLinkInfo } from '@/components/TelegramLinkDialog';

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
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('');
  const [edit, setEdit] = useState<{ mode: 'create' | 'edit'; user?: UserRow } | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [reset, setReset] = useState<UserRow | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [revoke, setRevoke] = useState<UserRow | null>(null);
  const [sig, setSig] = useState<UserRow | null>(null);
  const [unlink, setUnlink] = useState<UserRow | null>(null);
  const [tg, setTg] = useState<{ info: TelegramLinkInfo; name: string } | null>(null);

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

  const doLink = useMutation({
    mutationFn: (u: UserRow) => api.post<TelegramLinkInfo>(`/users/${u.id}/telegram-link`).then((info) => ({ info, name: u.fullName })),
    onSuccess: (r) => setTg(r),
    onError: (e) => toast.error(e),
  });
  const doUnlink = useMutation({
    mutationFn: (u: UserRow) => api.post(`/users/${u.id}/telegram-unlink`),
    onSuccess: () => {
      toast.success(t('admin.users.unlinked'));
      setUnlink(null);
      void reload();
    },
    onError: (e) => toast.error(e),
  });

  function rowMenu(row: UserRow): MenuItem[] {
    return [
      { key: 'edit', label: t('common.edit'), icon: <Icon as={Pencil} size={16} />, hidden: !canManage, onSelect: () => open('edit', row) },
      { key: 'roles', label: t('admin.users.editRoles'), icon: <Icon as={ShieldCheck} size={16} />, hidden: !canManage, onSelect: () => open('edit', row) },
      { key: 'sig', label: t('admin.users.signature'), icon: <Icon as={PenLine} size={16} />, hidden: !can('signatures.manage'), onSelect: () => setSig(row) },
      { key: 'sep1', separator: true },
      { key: 'reset', label: t('admin.users.resetPassword'), icon: <Icon as={KeyRound} size={16} />, hidden: !canManage, onSelect: () => setReset(row) },
      { key: 'revoke', label: t('admin.users.revokeSessions'), icon: <Icon as={LogOut} size={16} />, hidden: !canManage, onSelect: () => setRevoke(row) },
      { key: 'tg-link', label: t('admin.users.telegramLink'), icon: <Icon as={Send} size={16} />, hidden: !canManage || row.telegramLinked, testId: 'tg-link', onSelect: () => doLink.mutate(row) },
      { key: 'tg-unlink', label: t('admin.users.telegramUnlink'), icon: <Icon as={Unlink} size={16} />, hidden: !canManage || !row.telegramLinked, testId: 'tg-unlink', onSelect: () => setUnlink(row) },
    ];
  }

  function submit() {
    const req: (keyof Form)[] = edit!.mode === 'create' ? ['username', 'password', 'fullName'] : ['fullName'];
    const missing = requiredErrors(form as unknown as Record<string, unknown>, req as string[], t('common.fieldRequired'));
    if (Object.keys(missing).length) return setErrors(missing);
    save.mutate();
  }

  return (
    <Page testId="page-admin-users" width="wide">
      <PageHeader
        title={t('admin.users.title')}
        subtitle={t('admin.users.subtitle')}
        actions={canManage && <Button icon={<Icon as={Plus} size={16} />} onClick={() => open('create')}>{t('common.create')}</Button>}
      />
      <div className="max-w-sm">
        <SearchInput
          value={search}
          onChange={(v) => {
            setPage(1);
            setSearch(v.trim());
          }}
          placeholder={t('common.searchPlaceholder')}
        />
      </div>
      {list.error ? (
        <ErrorBlock message={errorMessage(list.error)} onRetry={() => void list.refetch()} />
      ) : (
        <DataTable<UserRow>
          testId="users"
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
            {
              key: 'fullName',
              header: t('admin.users.user'),
              sortable: true,
              primary: true,
              cell: (r) => (
                <span className="flex items-center gap-3">
                  <Avatar name={r.fullName} size={32} />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{r.fullName}</span>
                    <Code className="text-[11px] text-ink-3">{r.username}</Code>
                  </span>
                </span>
              ),
            },
            {
              key: 'roles',
              header: t('admin.users.roles'),
              cell: (r) =>
                r.roles.length ? (
                  <span className="flex flex-wrap gap-1">
                    {r.roles.slice(0, 3).map((x) => <Badge key={x.id} tone="navy">{name(x)}</Badge>)}
                    {r.roles.length > 3 && <Badge tone="gray">{`+${r.roles.length - 3}`}</Badge>}
                  </span>
                ) : '-',
            },
            { key: 'department', header: t('admin.users.department'), hideOnMobile: true, cell: (r) => r.departmentName ?? '-' },
            { key: 'email', header: t('admin.users.email'), hideOnMobile: true, cell: (r) => (r.email ? <span dir="ltr">{r.email}</span> : '-') },
            {
              key: 'telegram',
              header: t('admin.users.telegram'),
              cell: (r) => (
                <span data-testid="tg-chip">
                  <Badge tone={r.telegramLinked ? 'green' : 'gray'} icon={<Icon as={Send} size={14} />}>
                    {r.telegramLinked ? t('admin.users.telegramLinked') : t('admin.users.telegramNone')}
                  </Badge>
                </span>
              ),
            },
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
            { key: 'lastLoginAt', header: t('admin.users.lastLogin'), sortable: true, hideOnMobile: true, cell: (r) => (r.lastLoginAt ? <DateText value={r.lastLoginAt} mode="relative" /> : '-') },
          ]}
          rowActions={(row) => (
            <Menu align="end" items={rowMenu(row)} trigger={<IconButton icon={<Icon as={MoreHorizontal} size={18} />} label={t('admin.users.more')} />} />
          )}
        />
      )}

      <Modal
        open={!!edit}
        onClose={() => setEdit(null)}
        size="lg"
        testId="user-form"
        title={edit?.mode === 'create' ? t('common.create') : `${t('common.edit')} - ${edit?.user?.username ?? ''}`}
        footer={
          <>
            <Button loading={save.isPending} onClick={submit}>{t('common.save')}</Button>
            <Button variant="secondary" onClick={() => setEdit(null)}>{t('common.cancel')}</Button>
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
            <p className="mb-1 flex items-center gap-1.5 text-sm font-medium text-ink-2"><Icon as={ShieldCheck} size={16} />{t('admin.users.roles')}</p>
            <LookupMultiSelect entity="roles" value={form.roleIds} onChange={(ids) => set('roleIds', ids)} />
          </div>
          {edit?.mode === 'edit' && (
            <p className="text-xs text-ink-3 sm:col-span-2">
              {t('admin.users.telegram')}: <Badge tone={edit.user?.telegramLinked ? 'green' : 'gray'}>{edit.user?.telegramLinked ? t('admin.users.telegramLinked') : t('admin.users.telegramNone')}</Badge>
              <span className="ms-2">{t('admin.users.telegramNote')}</span>
            </p>
          )}
        </div>
      </Modal>

      <ConfirmDialog open={!!reset} onClose={() => setReset(null)} title={t('admin.users.resetPassword')} message={t('admin.users.resetBody')} danger loading={doReset.isPending} onConfirm={() => reset && doReset.mutate(reset)} />
      <ConfirmDialog open={!!unlink} onClose={() => setUnlink(null)} title={t('admin.users.telegramUnlink')} message={t('admin.users.unlinkBody')} danger loading={doUnlink.isPending} onConfirm={() => unlink && doUnlink.mutate(unlink)} />
      <TelegramLinkDialog open={!!tg} onClose={() => setTg(null)} info={tg?.info ?? null} subjectName={tg?.name ?? ''} />
      <ConfirmDialog open={!!revoke} onClose={() => setRevoke(null)} title={t('admin.users.revokeSessions')} message={t('admin.users.revokeBody')} danger loading={doRevoke.isPending} onConfirm={() => revoke && doRevoke.mutate(revoke)} />
      <Modal open={tempPassword !== null} onClose={() => setTempPassword(null)} size="sm" title={t('admin.users.resetPassword')} footer={<Button onClick={() => setTempPassword(null)}>{t('common.close')}</Button>}>
        <p className="mb-2 text-sm text-ink-2">{t('admin.users.tempPassword')}</p>
        <code dir="ltr" className="code block select-all rounded bg-surface-2 px-3 py-2 text-center text-lg font-semibold tracking-wider">{tempPassword}</code>
      </Modal>
      <Modal open={!!sig} onClose={() => { setSig(null); void reload(); }} size="lg" title={`${t('admin.users.signature')} - ${sig?.fullName ?? ''}`}>
        {sig && <SignatureManager owner="users" ownerId={sig.id} canEdit={can('signatures.manage')} onChanged={() => void reload()} />}
      </Modal>
    </Page>
  );
}
