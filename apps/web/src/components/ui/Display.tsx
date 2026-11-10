'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { AlertOctagon, AlertTriangle, ArrowLeft, Check, CheckCircle2, Inbox, Info, Loader2, Minus } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';
import { Icon } from './Icon';
import { Rule } from './Rule';

export type BadgeTone = 'gray' | 'green' | 'red' | 'amber' | 'blue' | 'purple' | 'brass' | 'navy';
const tones: Record<BadgeTone, string> = {
  gray: 'border-hairline bg-surface-2 text-ink-2',
  green: 'border-success/25 bg-success-bg text-success',
  red: 'border-danger/25 bg-danger-bg text-danger',
  amber: 'border-warning/25 bg-warning-bg text-warning',
  blue: 'border-info/25 bg-info-bg text-info',
  purple: 'border-brass/40 bg-brass-tint text-brass-tint-ink',
  brass: 'border-brass/40 bg-brass-tint text-brass-tint-ink',
  navy: 'border-primary/20 bg-primary-tint text-primary',
};

export function Badge({
  tone = 'gray',
  icon,
  size = 'md',
  children,
  className,
  title,
}: {
  tone?: BadgeTone;
  icon?: ReactNode;
  size?: 'sm' | 'md';
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded border text-xs font-medium', size === 'sm' ? 'h-5 px-1.5' : 'h-6 px-2', tones[tone], className)}
    >
      {icon}
      {children}
    </span>
  );
}

/** Active / inactive chip used by master-data lists. */
export function ActiveBadge({ active }: { active: boolean }) {
  const { t } = useT();
  return (
    <Badge tone={active ? 'green' : 'gray'} icon={<Icon as={active ? Check : Minus} size={14} />}>
      {active ? t('common.active') : t('common.inactive')}
    </Badge>
  );
}

export function Card({
  title,
  subtitle,
  actions,
  footer,
  children,
  className,
  padded = true,
  accent = 'none',
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  padded?: boolean;
  accent?: 'none' | 'rule' | 'brass';
}) {
  return (
    <section className={cn('overflow-hidden rounded-lg border border-hairline bg-surface', accent === 'brass' && 'border-t-2 border-t-brass', className)}>
      {accent === 'rule' && <Rule />}
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-5 py-3.5">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-ink">{title}</h3>
            {subtitle && <p className="text-xs text-ink-3">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn(padded && 'p-4 sm:p-5')}>{children}</div>
      {footer && <footer className="border-t border-hairline px-5 py-3">{footer}</footer>}
    </section>
  );
}

const widths = { default: 'max-w-page', wide: 'max-w-page-wide', narrow: 'max-w-page-narrow', full: '' } as const;

export function Page({ testId, width = 'default', children, className }: { testId: string; width?: 'default' | 'wide' | 'narrow' | 'full'; children: ReactNode; className?: string }) {
  return (
    <div data-testid={testId} className={cn('mx-auto w-full space-y-4 sm:space-y-6', widths[width], className)}>
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
  back,
  eyebrow,
  meta,
  rule,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
  eyebrow?: ReactNode;
  meta?: ReactNode;
  rule?: boolean;
}) {
  return (
    <div>
      {back && (
        <Link href={back.href} className="mb-2 inline-flex items-center gap-1 text-sm text-ink-3 hover:text-ink">
          <Icon as={ArrowLeft} mirror size={16} />
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          {eyebrow && <div className="text-xs font-medium text-brass-ink">{eyebrow}</div>}
          <h1 data-testid="page-title" className="display text-2xl text-ink lg:text-3xl">
            {title}
          </h1>
          {subtitle && <p className="mt-1 text-sm text-ink-2">{subtitle}</p>}
          {meta}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {rule !== false && <Rule className="mt-4" />}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-5 w-5 animate-spin text-ink-3', className)} aria-label="loading" />;
}

export function LoadingBlock() {
  return (
    <div className="flex min-h-40 items-center justify-center">
      <Spinner />
    </div>
  );
}

export function EmptyState({ title, hint, action, icon, compact }: { title?: ReactNode; hint?: ReactNode; action?: ReactNode; icon?: ReactNode; compact?: boolean }) {
  const { t } = useT();
  return (
    <div data-testid="empty-state" className={cn('flex flex-col items-center justify-center gap-2 px-4 text-center', compact ? 'py-6' : 'py-12')}>
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brass-tint text-brass-tint-ink">{icon ?? <Icon as={Inbox} size={24} />}</div>
      <p className="text-base font-semibold text-ink">{title ?? t('common.empty')}</p>
      {(hint ?? null) !== null && <p className="max-w-sm text-sm text-ink-2">{hint}</p>}
      {action}
    </div>
  );
}

type BannerTone = 'info' | 'success' | 'warning' | 'danger' | 'neutral';
const bannerTones: Record<BannerTone, string> = {
  info: tones.blue,
  success: tones.green,
  warning: tones.amber,
  danger: tones.red,
  neutral: tones.gray,
};
const bannerIcons = { info: Info, success: CheckCircle2, warning: AlertTriangle, danger: AlertOctagon, neutral: Info } as const;

export function Banner({
  tone,
  icon,
  title,
  children,
  action,
  className,
}: {
  tone: BannerTone;
  icon?: ReactNode;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div role={tone === 'danger' ? 'alert' : undefined} className={cn('flex items-start gap-3 rounded border px-4 py-3 text-sm', bannerTones[tone], className)}>
      <span className="mt-0.5">{icon ?? <Icon as={bannerIcons[tone]} />}</span>
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div>{children}</div>}
      </div>
      {action}
    </div>
  );
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useT();
  // Local import-free button markup keeps Display independent of Button's variants.
  return (
    <div data-testid="error-block">
      <Banner
        tone="danger"
        action={
          onRetry ? (
            <button type="button" onClick={onRetry} className="h-8 shrink-0 rounded px-3 text-sm font-medium text-ink-2 transition-colors duration-1 hover:bg-surface-2 hover:text-ink">
              {t('ui.retry')}
            </button>
          ) : undefined
        }
      >
        {message}
      </Banner>
    </div>
  );
}

export interface TabItem {
  key: string;
  label: ReactNode;
  count?: number;
  icon?: ReactNode;
}

export function Tabs({
  items,
  value,
  onChange,
  className,
  variant = 'underline',
}: {
  items: TabItem[];
  value: string;
  onChange: (key: string) => void;
  className?: string;
  variant?: 'underline' | 'pill';
}) {
  const pill = variant === 'pill';
  return (
    <div className={cn(pill ? 'inline-flex rounded border border-line bg-surface-2 p-0.5' : 'flex gap-6 overflow-x-auto border-b border-hairline', className)} role="tablist">
      {items.map((it) => {
        const active = it.key === value;
        return (
          <button
            key={it.key}
            type="button"
            role="tab"
            aria-selected={active}
            data-testid={'tab-' + it.key}
            onClick={() => onChange(it.key)}
            className={cn(
              'inline-flex items-center gap-1.5 whitespace-nowrap text-sm',
              pill
                ? cn('h-8 rounded-sm px-3', active ? 'bg-surface font-medium text-ink shadow-card' : 'text-ink-2 hover:text-ink')
                : cn('-mb-px h-10 border-b-2', active ? 'border-primary font-semibold text-ink' : 'border-transparent text-ink-2 hover:text-ink'),
            )}
          >
            {it.icon}
            {it.label}
            {it.count !== undefined && <span className="ms-1 num text-xs font-medium text-brass-ink">{it.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function DL({ children, cols = 3, className }: { children: ReactNode; cols?: 2 | 3 | 4; className?: string }) {
  const c = cols === 2 ? 'md:grid-cols-2' : cols === 4 ? 'md:grid-cols-4' : 'md:grid-cols-3';
  return <dl className={cn('grid grid-cols-2 gap-x-6 gap-y-4', c, className)}>{children}</dl>;
}

export function DLItem({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn('min-w-0', className)}>
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className="text-sm font-medium text-ink">{children}</dd>
    </div>
  );
}

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return <kbd className={cn('inline-flex h-5 min-w-5 items-center justify-center rounded border border-line bg-surface-2 px-1 font-mono text-[11px] text-ink-2', className)}>{children}</kbd>;
}
