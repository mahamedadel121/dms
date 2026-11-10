'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Languages, LogOut, Menu, UserCircle2, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { NAV } from '@/lib/nav';
import { LoadingBlock } from '@/components/ui/Display';
import { Sidebar } from './Sidebar';
import { NotificationsBell } from './NotificationsBell';

function BrandMark() {
  const { t } = useT();
  return (
    <Link href="/" className="flex items-center gap-2 px-4 py-4 text-white">
      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-brand-600 text-sm font-extrabold">D</span>
      <span className="text-sm font-bold leading-tight">{t('common.appName')}</span>
    </Link>
  );
}

/** Authenticated layout: redirects to /login, hides pages the user may not open. */
export function AppShell({ children }: { children: ReactNode }) {
  const { me, loading, logout, can } = useAuth();
  const { t, locale, setLocale } = useT();
  const router = useRouter();
  const path = usePathname();
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    if (!loading && !me) router.replace('/login');
  }, [loading, me, router]);
  useEffect(() => setMenu(false), [path]);

  if (loading || !me) return <LoadingBlock />;

  const guarded = NAV.flatMap((g) => g.items).find((i) => path === i.href || path.startsWith(i.href + '/'));
  const allowed = !guarded || can(guarded.permission);

  return (
    <div className="min-h-screen lg:flex">
      {/* desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col bg-slate-900 lg:flex lg:sticky lg:top-0 lg:h-screen">
        <BrandMark />
        <Sidebar />
      </aside>
      {/* mobile drawer */}
      {menu && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setMenu(false)} aria-hidden />
          <aside className="absolute inset-y-0 start-0 flex w-72 max-w-[85vw] flex-col bg-slate-900">
            <div className="flex items-center justify-between">
              <BrandMark />
              <button type="button" className="me-3 rounded p-1 text-slate-300" onClick={() => setMenu(false)} aria-label={t('common.nav.closeMenu')}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <Sidebar onNavigate={() => setMenu(false)} />
          </aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-slate-200 bg-white px-3 py-2 sm:px-5">
          <button type="button" className="rounded p-2 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={() => setMenu(true)} aria-label={t('common.nav.openMenu')}>
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => setLocale(locale === 'ar' ? 'en' : 'ar')}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-100"
            title={t('common.language')}
          >
            <Languages className="h-4 w-4" />
            {locale === 'ar' ? 'English' : 'العربية'}
          </button>
          <NotificationsBell />
          <Link href="/profile" className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-100">
            <UserCircle2 className="h-5 w-5 text-slate-500" />
            <span className="hidden max-w-40 truncate font-semibold sm:inline">{me.fullName}</span>
          </Link>
          <button type="button" onClick={() => void logout().then(() => router.replace('/login'))} className="rounded-md p-2 text-slate-500 hover:bg-slate-100" title={t('common.auth.logout')} aria-label={t('common.auth.logout')}>
            <LogOut className="h-4 w-4" />
          </button>
        </header>
        <main className="flex-1 px-3 py-5 sm:px-6">
          {allowed ? children : <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{t('common.auth.forbiddenPage')}</div>}
        </main>
      </div>
    </div>
  );
}
