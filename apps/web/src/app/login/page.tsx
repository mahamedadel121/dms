'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Languages } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { ApiError } from '@/lib/api';
import { Button, FormField, Input } from '@/components/ui';

export default function LoginPage() {
  const { me, loading, login } = useAuth();
  const { t, locale, setLocale } = useT();
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && me) router.replace('/');
  }, [loading, me, router]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(username.trim(), password);
      router.replace('/');
    } catch (err) {
      setError(err instanceof ApiError && err.status === 401 ? t('common.auth.failed') : err instanceof Error ? err.message : t('common.errorGeneric'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-900 to-slate-900 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl sm:p-8">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-700 text-xl font-extrabold text-white">D</div>
          <h1 className="text-xl font-bold text-slate-900">{t('common.appName')}</h1>
          <p className="mt-1 text-sm text-slate-500">{t('common.auth.subtitle')}</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <FormField label={t('common.auth.username')}>
            {(id) => <Input id={id} autoFocus autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} dir="ltr" />}
          </FormField>
          <FormField label={t('common.auth.password')}>
            {(id) => <Input id={id} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} dir="ltr" />}
          </FormField>
          {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>}
          <Button type="submit" className="w-full" loading={busy} disabled={!username || !password}>
            {t('common.auth.login')}
          </Button>
        </form>
        <button
          type="button"
          onClick={() => setLocale(locale === 'ar' ? 'en' : 'ar')}
          className="mx-auto mt-5 flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800"
        >
          <Languages className="h-4 w-4" />
          {locale === 'ar' ? 'English' : 'العربية'}
        </button>
      </div>
    </div>
  );
}
