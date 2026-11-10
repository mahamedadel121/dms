'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { PanelRightClose, PanelRightOpen } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { usePrefs } from '@/lib/prefs';
import { findNavItem } from '@/lib/nav';
import { cn } from '@/lib/cn';
import { BrandMark } from '@/components/brand/BrandMark';
import { Banner, Drawer, Icon, IconButton } from '@/components/ui';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { MobileTabBar, isRequestDetailPath } from './MobileTabBar';
import { UserMenu, UserMenuInline } from './UserMenu';

/** Authenticated layout: redirects to /login, hides pages the user may not open. */
export function AppShell({ children }: { children: ReactNode }) {
  const { me, loading, can } = useAuth();
  const { t } = useT();
  const { sidebarCollapsed, setSidebarCollapsed } = usePrefs();
  const router = useRouter();
  const path = usePathname();
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    if (!loading && !me) router.replace('/login');
  }, [loading, me, router]);
  useEffect(() => setMenu(false), [path]);

  if (loading || !me) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-canvas">
        <BrandMark size={48} className="animate-pulse" />
      </div>
    );
  }

  const guarded = findNavItem(path);
  const allowed = !guarded || can(guarded.item.permission);
  const collapsed = sidebarCollapsed;

  return (
    <div data-testid="app-shell" className="min-h-dvh pt-band lg:flex">
      <div data-no-print className="rule-double fixed inset-x-0 top-0 z-topbar bg-canvas" />
      <aside
        data-testid="sidebar"
        data-no-print
        className={cn(
          'sticky top-band hidden h-[calc(100dvh-5px)] shrink-0 flex-col border-e border-hairline bg-surface-2 lg:flex',
          collapsed ? 'w-sidebar-min' : 'w-sidebar',
        )}
      >
        <div className={cn('flex h-topbar items-center px-4', collapsed ? 'justify-center px-0' : 'justify-between')}>
          {!collapsed && (
            <Link href="/" aria-label={t('common.appName')}>
              <BrandMark withName />
            </Link>
          )}
          <IconButton
            size="sm"
            icon={<Icon as={collapsed ? PanelRightOpen : PanelRightClose} mirror />}
            label={collapsed ? t('shell.sidebar.expand') : t('shell.sidebar.collapse')}
            onClick={() => setSidebarCollapsed(!collapsed)}
          />
        </div>
        <Sidebar collapsed={collapsed} />
        <div className="border-t border-hairline p-3">
          <UserMenu collapsed={collapsed} />
        </div>
      </aside>

      <Drawer
        open={menu}
        onClose={() => setMenu(false)}
        side="start"
        width="sm"
        testId="nav-drawer"
        title={<BrandMark withName />}
        footer={<UserMenuInline onDone={() => setMenu(false)} />}
      >
        <div className="-mx-5 -my-4 flex flex-col">
          <Sidebar onNavigate={() => setMenu(false)} />
        </div>
      </Drawer>

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onMenu={() => setMenu(true)} />
        <main className={cn('min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-7', isRequestDetailPath(path) ? 'pb-7' : 'pb-[84px] md:pb-7')}>
          {allowed ? children : <Banner tone="warning">{t('common.auth.forbiddenPage')}</Banner>}
        </main>
      </div>
      <MobileTabBar onMore={() => setMenu(true)} />
    </div>
  );
}
