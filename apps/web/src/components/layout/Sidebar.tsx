'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ArrowLeftRight, BarChart3, BookOpen, Building2, Car, FileText, GitBranch, Inbox, Landmark, LayoutDashboard, LayoutTemplate,
  Network, Receipt, ScrollText, Server, Settings, Settings2, ShieldCheck, Tags, Truck, UserCheck, UserCog, Users,
  type LucideIcon,
} from 'lucide-react';
import { NAV } from '@/lib/nav';
import { cn } from '@/lib/cn';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';

const ICONS: Record<string, LucideIcon> = {
  ArrowLeftRight, BarChart3, BookOpen, Building2, Car, FileText, GitBranch, Inbox, Landmark, LayoutDashboard, LayoutTemplate,
  Network, Receipt, ScrollText, Server, Settings, Settings2, ShieldCheck, Tags, Truck, UserCheck, UserCog, Users,
};

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { can } = useAuth();
  const { t } = useT();
  const path = usePathname();
  return (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
      {NAV.map((g) => {
        const items = g.items.filter((i) => can(i.permission));
        if (items.length === 0) return null;
        return (
          <div key={g.key}>
            <p className="mb-1.5 px-3 text-xs font-bold uppercase tracking-wider text-slate-400">{t(g.labelKey)}</p>
            <ul className="space-y-0.5">
              {items.map((i) => {
                const Icon = ICONS[i.icon] ?? FileText;
                const active = path === i.href || path.startsWith(i.href + '/');
                return (
                  <li key={i.href}>
                    <Link
                      href={i.href}
                      onClick={onNavigate}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                        active ? 'bg-brand-700 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white',
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" aria-hidden />
                      {t(i.labelKey)}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
