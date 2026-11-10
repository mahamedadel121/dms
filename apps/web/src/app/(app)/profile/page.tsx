'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff, Send } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { usePrefs } from '@/lib/prefs';
import type { Density, ThemePref } from '@/lib/prefs-core';
import type { NumeralSystem } from '@/lib/format';
import {
  Avatar, Badge, Button, Card, Code, ConfirmDialog, DataTable, DateText, ErrorBlock, FormField, Icon, IconButton, Input, Page, PageHeader,
  SegmentedControl, fieldErrorsFromApi, useToast,
} from '@/components/ui';
import { SignatureManager } from '@/components/SignatureManager';
import { TelegramLinkDialog, type TelegramLinkInfo } from '@/components/TelegramLinkDialog';

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
  const { theme, setTheme, numerals, setNumerals, density, setDensity } = usePrefs();
  const { me, can, reloadMe } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [showPw, setShowPw] = useState(false);
  const [tgInfo, setTgInfo] = useState<TelegramLinkInfo | null>(null);
  const [tgOpen, setTgOpen] = useState(false);
  const [tgConfirm, setTgConfirm] = useState(false);

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
  const tgLink = useMutation({
    mutationFn: () => api.post<TelegramLinkInfo>(`/users/${me?.id}/telegram-link`),
    onSuccess: (info) => {
      setTgInfo(info);
      setTgOpen(true);
    },
    onError: (e) => toast.error(e),
  });
  const tgUnlink = useMutation({
    mutationFn: () => api.post(`/users/${me?.id}/telegram-unlink`),
    onSuccess: async () => {
      setTgConfirm(false);
      toast.success(t('shell.tg.unlinked'));
      await reloadMe();
    },
    onError: (e) => toast.error(e),
  });

  function submitPw() {
    if (pw.newPassword !== pw.confirm) return setErrors({ confirm: t('common.profile.passwordMismatch') });
    if (pw.newPassword.length < 8) return setErrors({ newPassword: t('admin.users.passwordHint') });
    setErrors({});
    change.mutate();
  }

  if (!me) return null;
  const pwType = showPw ? 'text' : 'password';
  const pwToggle = (
    <IconButton
      size="sm"
      icon={<Icon as={showPw ? EyeOff : Eye} size={16} />}
      label={showPw ? t('shell.login.hidePassword') : t('shell.login.showPassword')}
      onClick={() => setShowPw((v) => !v)}
    />
  );

  return (
    <Page testId="page-profile" width="narrow">
      <PageHeader title={t('common.profile.title')} />

      <Card title={t('common.profile.account')}>
        <div className="flex items-center gap-4">
          <Avatar name={me.fullName} size={40} />
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-ink">{me.fullName}</p>
            <Code>{me.username}</Code>
          </div>
        </div>
        <p className="mb-2 mt-4 text-sm font-medium text-ink-2">{t('common.profile.roles')}</p>
        <div className="flex flex-wrap gap-1.5">
          {me.roles.map((r) => (
            <Badge key={r.roleId + (r.viaDelegationId ?? '')} tone={r.viaDelegationId ? 'amber' : 'navy'}>
              {name(r)}
              {r.viaDelegationId ? ` (${t('common.profile.viaDelegation')})` : ''}
            </Badge>
          ))}
        </div>
      </Card>

      <Card title={t('shell.pref.title')}>
        <div className="space-y-4">
          <FormField label={t('shell.pref.theme')}>
            {() => (
              <SegmentedControl<ThemePref>
                ariaLabel={t('shell.pref.theme')}
                value={theme}
                onChange={setTheme}
                items={[
                  { value: 'light', label: t('shell.pref.light'), testId: 'pref-theme-light' },
                  { value: 'dark', label: t('shell.pref.dark'), testId: 'pref-theme-dark' },
                  { value: 'system', label: t('shell.pref.system'), testId: 'pref-theme-system' },
                ]}
              />
            )}
          </FormField>
          <FormField label={t('shell.pref.numerals')} hint={t('shell.pref.numeralsHint')}>
            {() => (
              <SegmentedControl<NumeralSystem>
                ariaLabel={t('shell.pref.numerals')}
                value={numerals}
                onChange={setNumerals}
                items={[
                  { value: 'latn', label: '123', testId: 'pref-numerals-latn' },
                  { value: 'arab', label: '١٢٣', testId: 'pref-numerals-arab' },
                ]}
              />
            )}
          </FormField>
          <FormField label={t('shell.pref.density')}>
            {() => (
              <SegmentedControl<Density>
                ariaLabel={t('shell.pref.density')}
                value={density}
                onChange={setDensity}
                items={[
                  { value: 'comfortable', label: t('shell.pref.comfortable'), testId: 'pref-density-comfortable' },
                  { value: 'default', label: t('shell.pref.default'), testId: 'pref-density-default' },
                  { value: 'compact', label: t('shell.pref.compact'), testId: 'pref-density-compact' },
                ]}
              />
            )}
          </FormField>
          <FormField label={t('shell.pref.language')}>
            {() => (
              <SegmentedControl<'ar' | 'en'>
                ariaLabel={t('shell.pref.language')}
                value={locale}
                onChange={setLocale}
                items={[
                  { value: 'ar', label: 'العربية', testId: 'pref-lang-ar' },
                  { value: 'en', label: 'English', testId: 'pref-lang-en' },
                ]}
              />
            )}
          </FormField>
        </div>
      </Card>

      <Card title={t('common.profile.signature')}>
        <SignatureManager owner="users" ownerId={me.id} canEdit={can('signatures.manage')} onChanged={() => void reloadMe()} />
      </Card>

      <Card title={t('shell.tg.section')}>
        {me.telegramLinked ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Badge tone="green" icon={<Icon as={Send} size={14} />}>
              {t('shell.tg.linked')}
            </Badge>
            <Button variant="secondary" data-testid="profile-tg-unlink" onClick={() => setTgConfirm(true)}>
              {t('shell.tg.unlink')}
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink-2">{t('shell.tg.notLinked')}</p>
            <Button icon={<Icon as={Send} size={16} />} loading={tgLink.isPending} data-testid="profile-tg-link" onClick={() => tgLink.mutate()}>
              {t('shell.tg.link')}
            </Button>
          </div>
        )}
      </Card>

      <Card title={t('common.profile.changePassword')}>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            submitPw();
          }}
        >
          <FormField label={t('common.profile.currentPassword')} error={errors.currentPassword}>
            {(id) => (
              <Input
                id={id}
                type={pwType}
                dir="ltr"
                autoComplete="current-password"
                endAdornment={pwToggle}
                value={pw.currentPassword}
                onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })}
              />
            )}
          </FormField>
          <FormField label={t('common.profile.newPassword')} error={errors.newPassword}>
            {(id) => <Input id={id} type={pwType} dir="ltr" autoComplete="new-password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} />}
          </FormField>
          <FormField label={t('common.profile.confirmPassword')} error={errors.confirm}>
            {(id) => <Input id={id} type={pwType} dir="ltr" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />}
          </FormField>
          <Button type="submit" loading={change.isPending} disabled={!pw.currentPassword || !pw.newPassword}>
            {t('common.save')}
          </Button>
        </form>
      </Card>

      <Card title={t('common.profile.sessions')} padded={false}>
        {sessions.error ? (
          <div className="p-4">
            <ErrorBlock message={errorMessage(sessions.error)} onRetry={() => void sessions.refetch()} />
          </div>
        ) : (
          <DataTable<Session>
            testId="sessions"
            rows={sessions.data}
            rowKey={(s) => s.id}
            loading={sessions.isFetching}
            columns={[
              {
                key: 'ua',
                header: t('shell.profile.device'),
                primary: true,
                cell: (s) => (
                  <span className="text-xs" dir="ltr">
                    {(s.userAgent ?? '').slice(0, 60) || '-'} {s.current && <Badge tone="green" size="sm">{t('shell.profile.current')}</Badge>}
                  </span>
                ),
              },
              { key: 'ip', header: 'IP', cell: (s) => <bdi className="num">{s.ip ?? '-'}</bdi> },
              { key: 'lastUsedAt', header: t('common.date'), cell: (s) => <DateText value={s.lastUsedAt} mode="relative" /> },
            ]}
            rowActions={(s) =>
              !s.current && (
                <Button size="sm" variant="ghost" onClick={() => revoke.mutate(s.id)}>
                  {t('common.profile.revokeSession')}
                </Button>
              )
            }
          />
        )}
      </Card>

      <TelegramLinkDialog
        open={tgOpen}
        onClose={() => {
          setTgOpen(false);
          void reloadMe();
        }}
        info={tgInfo}
        subjectName={me.fullName}
      />
      <ConfirmDialog
        open={tgConfirm}
        onClose={() => setTgConfirm(false)}
        onConfirm={() => tgUnlink.mutate()}
        loading={tgUnlink.isPending}
        title={t('shell.tg.section')}
        message={t('shell.tg.unlinkConfirm')}
        confirmLabel={t('shell.tg.unlink')}
        confirmTestId="profile-tg-unlink-confirm"
      />
    </Page>
  );
}
