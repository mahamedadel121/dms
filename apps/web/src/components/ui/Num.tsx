'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';
import { formatCount, formatDay, formatDayTime, formatNumber, formatRelative } from '@/lib/format';
import { useContext } from 'react';
import { PrefsContext } from '@/lib/prefs';
import { Badge } from './Display';

/** Re-renders when the numeral preference changes (the formatters read a module-level setting). */
function useNumeralTick(): void {
  useContext(PrefsContext);
}

export function Num({ value, decimals, className }: { value: number | string | null | undefined; decimals?: number; className?: string }) {
  useNumeralTick();
  const empty = value === null || value === undefined || value === '';
  const text = empty ? '—' : decimals !== undefined ? formatNumber(value, decimals) : formatCount(value);
  return <span className={cn('num', className)}>{text}</span>;
}

const moneySize = {
  sm: 'text-sm',
  md: 'text-base font-medium',
  lg: 'text-xl font-semibold',
  hero: 'display text-3xl lg:text-4xl',
} as const;

export function Money({
  value,
  original,
  size = 'sm',
  muted,
  className,
}: {
  value: string | number | null | undefined;
  original?: string | number | null;
  size?: 'sm' | 'md' | 'lg' | 'hero';
  muted?: boolean;
  className?: string;
}) {
  const { t, locale } = useT();
  useNumeralTick();
  if (value === null || value === undefined || value === '') return <span className={cn('text-ink-3', className)}>—</span>;
  const unit = locale === 'ar' ? 'ج.م' : 'EGP';
  const edited = original !== null && original !== undefined && original !== '' && Number(original) !== Number(value);
  const amount = (
    <bdi className={cn('whitespace-nowrap', moneySize[size], muted ? 'text-ink-3' : 'text-ink')}>
      <span className="num">{formatNumber(value)}</span>
      <span className="ms-1 text-[0.8em] text-ink-3">{unit}</span>
    </bdi>
  );
  if (!edited) return <span className={className}>{amount}</span>;
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-x-2 gap-y-1', className)}>
      <span className="num text-sm text-ink-3 line-through">{formatNumber(original)}</span>
      {amount}
      <Badge tone="brass" size="sm">
        {t('ui.edited')}
      </Badge>
    </span>
  );
}

export function Code({ children, className, title }: { children: ReactNode; className?: string; title?: string }) {
  return (
    <bdi className={cn('code', className)} title={title}>
      {children}
    </bdi>
  );
}

export function DateText({
  value,
  mode = 'day',
  className,
}: {
  value: string | Date | null | undefined;
  mode?: 'day' | 'dayTime' | 'relative' | 'long';
  className?: string;
}) {
  const { locale } = useT();
  useNumeralTick();
  if (value === null || value === undefined || value === '') return <span className={cn('text-ink-3', className)}>—</span>;
  const abs = formatDayTime(value, locale);
  if (!abs) return <span className={cn('text-ink-3', className)}>—</span>;
  const text =
    mode === 'dayTime' ? abs : mode === 'relative' ? formatRelative(value, locale) : mode === 'long' ? formatDay(value, locale, 'long') : formatDay(value, locale, 'short');
  const iso = value instanceof Date ? value.toISOString() : value;
  return (
    <time className={cn('num', className)} dateTime={iso} title={mode === 'relative' ? abs : undefined}>
      {text}
    </time>
  );
}
