'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { formatDateTime } from '@/lib/format';
import { Badge, Button, Card, DataTable, ErrorBlock, FormField, Input, PageHeader, Select, fieldErrorsFromApi, useToast } from '@/components/ui';
import { SignatureManager } from '@/components/SignatureManager';

interface Session {
  id: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  lastUsedAt: string;
  current: boolean;
}

export default function ProfilePage() {
  const { t, name, locale, setLocale } = useT();
  const { me, can, reloadMe } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});

  const sessions = useQuery({ queryKey: ['sessions'], queryFn: () => api.get<Session[]>('/auth/sessions') });
  const revoke = useMutation({
    mutationFn: (id: string) => api.del(`/auth/sessions/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions'] }),
    onError: (e) => toast.error(e),
  });
  const change = useMutation({
    mutationFn: () => api.post('/auth/change-password', { currentPassword: pw.currentPassword, newPassword: pw.newPassword }),
    onSuccess: () => {
      toast.success(t('common.profile.passwordChanged'));
      setPw({ currentPassword: '', newPassword: '', confirm: '' });
      void reloadMe();
    },
    onError: (e) => {
      setErrors(fieldErrorsFromApi(e));
      toast.error(e);
    },
  });

  function submitPw() {
    if (pw.newPassword !== pw.confirm) return setErrors({ confirm: t('common.profile.passwordMismatch') });
    if (pw.newPassword.length < 8) return setErrors({ newPassword: t('admin.users.passwordHint') });
    setErrors({});
    change.mutate();
  }

  if (!me) return null;
  return (
    <>
      <PageHeader title={t('common.profile.title')} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={t('common.profile.account')}>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">{t('common.name')}</dt><dd className="font-semibold">{me.fullName}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">{t('admin.users.username')}</dt><dd className="font-semibold" dir="ltr">{me.username}</dd></div>
          </dl>
          <div className="mt-4">
            <FormField label={t('common.profile.language')}>
              {(id) => (
                <Select id={id} value={locale} options={[{ value: 'ar', label: t('common.arabic') }, { value: 'en', label: t('common.english') }]} onChange={(v) => setLocale(v as 'ar' | 'en')} />
              )}
            </FormField>
          </div>
          <p className="mb-2 mt-4 text-sm font-semibold text-slate-700">{t('common.profile.roles')}</p>
          <div className="flex flex-wrap gap-1.5">
            {me.roles.map((r) => (
              <Badge key={r.roleId + (r.viaDelegationId ?? '')} tone={r.viaDelegationId ? 'amber' : 'blue'}>
                {name(r)}{r.viaDelegationId ? ` (${t('common.profile.viaDelegation')})` : ''}
              </Badge>
            ))}
          </div>
        </Card>

        <Card title={t('common.profile.changePassword')}>
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); submitPw(); }}>
            <FormField label={t('common.profile.currentPassword')} error={errors.currentPassword}>
              {(id) => <Input id={id} type="password" dir="ltr" autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} />}
            </FormField>
            <FormField label={t('common.profile.newPassword')} error={errors.newPassword}>
              {(id) => <Input id={id} type="password" dir="ltr" autoComplete="new-password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} />}
            </FormField>
            <FormField label={t('common.profile.confirmPassword')} error={errors.confirm}>
              {(id) => <Input id={id} type="password" dir="ltr" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />}
            </FormField>
            <Button type="submit" loading={change.isPending} disabled={!pw.currentPassword || !pw.newPassword}>{t('common.save')}</Button>
          </form>
        </Card>

        <Card title={t('common.profile.signature')} className="lg:col-span-2">
          <SignatureManager owner="users" ownerId={me.id} canEdit={can('signatures.manage')} onChanged={() => void reloadMe()} />
        </Card>

        <Card title={t('common.profile.sessions')} padded={false} className="lg:col-span-2">
          {sessions.error ? (
            <div className="p-4"><ErrorBlock message={errorMessage(sessions.error)} /></div>
          ) : (
            <DataTable<Session>
              rows={sessions.data}
              rowKey={(s) => s.id}
              loading={sessions.isFetching}
              columns={[
                { key: 'ua', header: 'Device', primary: true, cell: (s) => <span className="text-xs" dir="ltr">{(s.userAgent ?? '').slice(0, 60) || '-'} {s.current && <Badge tone="green">current</Badge>}</span> },
                { key: 'ip', header: 'IP', cell: (s) => <bdi>{s.ip ?? '-'}</bdi> },
                { key: 'lastUsedAt', header: t('common.date'), cell: (s) => formatDateTime(s.lastUsedAt) },
              ]}
              rowActions={(s) => !s.current && <Button size="sm" variant="ghost" onClick={() => revoke.mutate(s.id)}>{t('common.profile.revokeSession')}</Button>}
            />
          )}
        </Card>
      </div>
    </>
  );
}
