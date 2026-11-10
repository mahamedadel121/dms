'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, FileText, Inbox, Menu, type LucideIcon } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/cn';
import { Icon } from '@/components/ui';
import { useInboxCount } from './useInboxCount';

/** True for `/requests/<id>` (the request action bar takes the tab bar's place). */
export function isRequestDetailPath(path: string): boolean {
  return /^\/requests\/[^/]+/.test(path);
}

interface Tab {
  key: 'inbox' | 'requests' | 'notifications';
  href: string;
  icon: LucideIcon;
  perm: string | undefined;
}

const TABS: Tab[] = [
  { key: 'inbox', href: '/inbox', icon: Inbox, perm: 'requests.view' },
  { key: 'requests', href: '/requests', icon: FileText, perm: 'requests.view' },
  { key: 'notifications', href: '/notifications', icon: Bell, perm: undefined },
];

export function MobileTabBar({ onMore }: { onMore: () => void }) {
  const { can } = useAuth();
  const { t } = useT();
  const path = usePathname();
  const inbox = useInboxCount();
  const unread = useQuery({
    queryKey: ['notifications', 'count'],
    queryFn: () => api.get<{ count: number }>('/notifications/unread-count'),
    refetchInterval: 30_000,
  });
  if (isRequestDetailPath(path)) return null;

  const base = 'relative flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px]';
  return (
    <nav
      data-testid="mobile-tabbar"
      data-no-print
      className="fixed inset-x-0 bottom-0 z-bar flex h-tabbar items-stretch border-t border-hairline bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {TABS.filter((x) => can(x.perm)).map((x) => {
        const active = path === x.href || path.startsWith(x.href + '/');
        const badge = x.key === 'inbox' ? inbox.count : 0;
        return (
          <Link
            key={x.key}
            href={x.href}
            data-testid={'tab-' + x.key}
            aria-current={active ? 'page' : undefined}
            className={cn(base, active ? 'font-medium text-primary' : 'text-ink-3')}
          >
            {active && <span className="absolute inset-x-4 top-0 h-0.5 bg-brass" />}
            <span className="relative">
              <Icon as={x.icon} size={20} />
              {badge > 0 && (
                <span className="num absolute -end-2 -top-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] text-on-primary">
                  {badge > 99 ? '99+' : badge}
                </span>
              )}
              {x.key === 'notifications' && (unread.data?.count ?? 0) > 0 && <span className="absolute -end-0.5 -top-0.5 h-2 w-2 rounded-full bg-danger" />}
            </span>
            {t('shell.tab.' + x.key)}
          </Link>
        );
      })}
      <button type="button" data-testid="tab-more" onClick={onMore} className={cn(base, 'text-ink-3')}>
        <Icon as={Menu} size={20} />
        {t('shell.tab.more')}
      </button>
    </nav>
  );
}
