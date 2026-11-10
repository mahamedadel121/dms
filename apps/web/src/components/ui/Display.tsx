'use client';

import type { ReactNode } from 'react';
import { Inbox, Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';

export type BadgeTone = 'gray' | 'green' | 'red' | 'amber' | 'blue' | 'purple';
const tones: Record<BadgeTone, string> = {
  gray: 'bg-slate-100 text-slate-700',
  green: 'bg-emerald-100 text-emerald-800',
  red: 'bg-red-100 text-red-800',
  amber: 'bg-amber-100 text-amber-800',
  blue: 'bg-sky-100 text-sky-800',
  purple: 'bg-violet-100 text-violet-800',
};

export function Badge({ tone = 'gray', children, className }: { tone?: BadgeTone; children: ReactNode; className?: string }) {
  return <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold', tones[tone], className)}>{children}</span>;
}

/** Active / inactive pill used by master-data lists. */
export function ActiveBadge({ active }: { active: boolean }) {
  const { t } = useT();
  return <Badge tone={active ? 'green' : 'gray'}>{active ? t('common.active') : t('common.inactive')}</Badge>;
}

export function Card({ title, actions, children, className, padded = true }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; padded?: boolean }) {
  return (
    <section className={cn('rounded-xl border border-slate-200 bg-white shadow-sm', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <h3 className="text-sm font-bold text-slate-800">{title}</h3>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn(padded && 'p-4')}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-5 w-5 animate-spin text-brand-700', className)} aria-label="loading" />;
}

export function LoadingBlock() {
  return (
    <div className="flex items-center justify-center py-12">
      <Spinner className="h-7 w-7" />
    </div>
  );
}

export function EmptyState({ title, hint, action, icon }: { title?: ReactNode; hint?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  const { t } = useT();
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
      <div className="text-slate-300">{icon ?? <Inbox className="h-10 w-10" />}</div>
      <p className="text-sm font-semibold text-slate-700">{title ?? t('common.empty')}</p>
      {(hint ?? null) !== null && <p className="text-xs text-slate-500">{hint}</p>}
      {action}
    </div>
  );
}

export function ErrorBlock({ message }: { message: string }) {
  return <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{message}</div>;
}

export interface TabItem {
  key: string;
  label: ReactNode;
  count?: number;
}

export function Tabs({ items, value, onChange, className }: { items: TabItem[]; value: string; onChange: (key: string) => void; className?: string }) {
  return (
    <div className={cn('flex gap-1 overflow-x-auto border-b border-slate-200', className)} role="tablist">
      {items.map((it) => (
        <button
          key={it.key}
          type="button"
          role="tab"
          aria-selected={it.key === value}
          onClick={() => onChange(it.key)}
          className={cn(
            '-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm font-semibold',
            it.key === value ? 'border-brand-700 text-brand-800' : 'border-transparent text-slate-500 hover:text-slate-800',
          )}
        >
          {it.label}
          {it.count !== undefined && <span className="ms-1.5 rounded-full bg-slate-100 px-1.5 text-xs text-slate-600">{it.count}</span>}
        </button>
      ))}
    </div>
  );
}
