'use client';

import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { BookCheck, Camera, Eye, EyeOff, Moon, Signature, Sun, type LucideIcon } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { usePrefs } from '@/lib/prefs';
import { ApiError } from '@/lib/api';
import { BrandMark } from '@/components/brand/BrandMark';
import { Banner, Button, FormField, Icon, IconButton, Input, Seal } from '@/components/ui';

const POINTS: { key: 'point1' | 'point2' | 'point3'; icon: LucideIcon }[] = [
  { key: 'point1', icon: Camera },
  { key: 'point2', icon: Signature },
  { key: 'point3', icon: BookCheck },
];

/** Staggered entrance: block `i` rises 40ms after block `i - 1`. */
const rise = (i: number): CSSProperties => ({ animationDelay: `${i * 40}ms`, animationFillMode: 'both' });

export default function LoginPage() {
  const { me, loading, login } = useAuth();
  const { t, locale, setLocale } = useT();
  const { resolvedTheme, setTheme } = usePrefs();
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
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
    <div data-testid="page-login" className="grid min-h-dvh bg-canvas pt-band lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <div className="rule-double fixed inset-x-0 top-0 z-topbar bg-canvas" data-no-print />

      <div className="order-2 flex items-center justify-center bg-canvas px-6 py-12 lg:order-none">
        <div className="w-full max-w-sm">
          <div className="animate-rise" style={rise(0)}>
            <BrandMark size={40} withName />
          </div>
          <div className="rule-double mt-5 w-[72px] animate-rise" style={rise(1)} />
          <h1 className="display mt-6 animate-rise text-3xl text-ink" style={rise(2)}>
            {t('shell.login.title')}
          </h1>
          <p className="mt-1 animate-rise text-sm text-ink-2" style={rise(3)}>
            {t('common.auth.subtitle')}
          </p>

          <form onSubmit={submit} data-testid="login-form" className="mt-8 space-y-4">
            <div className="animate-rise" style={rise(4)}>
              <FormField label={t('common.auth.username')}>
                {(id) => (
                  <Input
                    id={id}
                    autoFocus
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    dir="ltr"
                    data-testid="login-username"
                  />
                )}
              </FormField>
            </div>
            <div className="animate-rise" style={rise(5)}>
              <FormField label={t('common.auth.password')}>
                {(id) => (
                  <Input
                    id={id}
                    type={show ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    dir="ltr"
                    data-testid="login-password"
                    endAdornment={
                      <IconButton
                        size="sm"
                        data-testid="login-toggle-password"
                        icon={<Icon as={show ? EyeOff : Eye} size={16} />}
                        label={show ? t('shell.login.hidePassword') : t('shell.login.showPassword')}
                        onClick={() => setShow((v) => !v)}
                      />
                    }
                  />
                )}
              </FormField>
            </div>
            <div aria-live="polite">{error && (
                <div data-testid="login-error">
                  <Banner tone="danger">{error}</Banner>
                </div>
              )}</div>
            <div className="animate-rise" style={rise(6)}>
              <Button type="submit" size="lg" block loading={busy} disabled={!username || !password} data-testid="login-submit">
                {t('common.auth.login')}
              </Button>
            </div>
          </form>

          <div className="mt-6 flex items-center gap-3 text-sm text-ink-3">
            <button type="button" className="font-medium hover:text-ink" onClick={() => setLocale(locale === 'ar' ? 'en' : 'ar')}>
              {locale === 'ar' ? 'English' : 'العربية'}
            </button>
            <span aria-hidden>·</span>
            <IconButton
              size="sm"
              icon={<Icon as={resolvedTheme === 'dark' ? Sun : Moon} size={16} />}
              label={resolvedTheme === 'dark' ? t('shell.pref.light') : t('shell.pref.dark')}
              onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
            />
          </div>
        </div>
      </div>

      <div className="order-1 h-28 bg-primary lattice lg:order-none lg:hidden" aria-hidden />
      <div className="relative order-1 hidden flex-col justify-between overflow-hidden bg-primary p-12 text-on-primary lattice lg:order-none lg:flex">
        <h2 className="display text-4xl leading-[1.5]">
          {t('shell.login.headline1')}
          <br />
          {t('shell.login.headline2')}
        </h2>
        <ul className="space-y-4">
          {POINTS.map((p) => (
            <li key={p.key} className="flex items-center gap-3 text-base">
              <Icon as={p.icon} size={20} className="text-brass" />
              {t('shell.login.' + p.key)}
            </li>
          ))}
        </ul>
        <div className="self-end">
          <Seal kind="approved" size={132} animate className="text-brass" />
        </div>
      </div>
    </div>
  );
}
