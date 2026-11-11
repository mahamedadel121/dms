'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ArrowLeftRight, BarChart3, BookOpen, Building2, Car, FileStack, FileText, GitBranch, Inbox, Landmark, LayoutDashboard, LayoutTemplate,
  Network, Receipt, ScrollText, Server, Settings, Settings2, ShieldCheck, Tags, Truck, UserCheck, UserCog, Users,
  type LucideIcon,
} from 'lucide-react';
import { navSlug, visibleNav } from '@/lib/nav';
import { cn } from '@/lib/cn';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { Icon, Tooltip } from '@/components/ui';
import { useInboxCount } from './useInboxCount';

export const NAV_ICONS: Record<string, LucideIcon> = {
  ArrowLeftRight, BarChart3, BookOpen, Building2, Car, FileStack, FileText, GitBranch, Inbox, Landmark, LayoutDashboard, LayoutTemplate,
  Network, Receipt, ScrollText, Server, Settings, Settings2, ShieldCheck, Tags, Truck, UserCheck, UserCog, Users,
};

/** The navigation list (used in the desktop sidebar and inside the mobile drawer). */
export function Sidebar({ onNavigate, collapsed = false }: { onNavigate?: () => void; collapsed?: boolean }) {
  const { can } = useAuth();
  const { t } = useT();
  const path = usePathname();
  const inbox = useInboxCount();

  return (
    <nav aria-label={t('shell.nav.label')} className={cn('flex-1 overflow-y-auto py-3', collapsed ? 'space-y-1 px-2' : 'space-y-5 px-3')}>
      {visibleNav().map((g, gi) => {
        const items = g.items.filter((i) => can(i.permission));
        if (items.length === 0) return null;
        return (
          <div key={g.key}>
            {collapsed ? (
              gi > 0 && <div className="mx-3 my-2 h-px bg-hairline" />
            ) : (
              <p className="mb-1 px-3 text-xs font-medium text-ink-3">{t(g.labelKey)}</p>
            )}
            <ul className="space-y-0.5">
              {items.map((i) => {
                const active = path === i.href || path.startsWith(i.href + '/');
                const showBadge = i.href === '/inbox' && inbox.count > 0;
                const link = (
                  <Link
                    href={i.href}
                    onClick={onNavigate}
                    data-testid={'nav-' + navSlug(i.href)}
                    aria-current={active ? 'page' : undefined}
                    aria-label={collapsed ? t(i.labelKey) : undefined}
                    className={cn(
                      'relative flex h-9 items-center gap-3 rounded px-3 text-sm text-ink-2 transition-colors duration-1 hover:bg-surface-3 hover:text-ink',
                      collapsed && 'justify-center px-0',
                      active && 'bg-surface font-medium text-ink shadow-card',
                    )}
                  >
                    {active && <span className="absolute inset-y-1.5 start-0 w-[3px] rounded-full bg-brass" />}
                    <Icon as={NAV_ICONS[i.icon] ?? FileText} size={18} />
                    {!collapsed && <span className="truncate">{t(i.labelKey)}</span>}
                    {showBadge && !collapsed && (
                      <span
                        data-testid="nav-badge-inbox"
                        className={cn(
                          'num ms-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-medium',
                          inbox.overdue > 0 ? 'bg-danger text-on-danger' : 'bg-primary text-on-primary',
                        )}
                      >
                        {inbox.count}
                      </span>
                    )}
                  </Link>
                );
                return <li key={i.href}>{collapsed ? <Tooltip content={t(i.labelKey)}>{link}</Tooltip> : link}</li>;
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
