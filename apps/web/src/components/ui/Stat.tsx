'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Badge } from './Display';
import { Rule } from './Rule';
import { Skeleton } from './Skeleton';

export function Stat({
  label,
  value,
  caption,
  delta,
  accent,
  tone = 'default',
  loading,
  onClick,
  active,
  testId,
}: {
  label: ReactNode;
  value: ReactNode;
  caption?: ReactNode;
  delta?: { text: string; tone: 'good' | 'bad' | 'neutral' };
  accent?: boolean;
  tone?: 'default' | 'danger';
  loading?: boolean;
  onClick?: () => void;
  active?: boolean;
  testId?: string;
}) {
  const body = (
    <>
      {accent && <Rule className="-mx-5 -mt-5 mb-4" />}
      <div className="text-13 text-ink-2">{label}</div>
      {loading ? (
        <Skeleton className="mt-2 h-8 w-24" />
      ) : (
        <div className={cn('display num mt-1', accent ? 'text-3xl lg:text-4xl' : 'text-2xl', tone === 'danger' ? 'text-danger' : 'text-ink')}>{value}</div>
      )}
      {(caption || delta) && (
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-3">
          {delta && (
            <Badge size="sm" tone={delta.tone === 'good' ? 'green' : delta.tone === 'bad' ? 'red' : 'gray'}>
              {delta.text}
            </Badge>
          )}
          {caption}
        </div>
      )}
    </>
  );
  const cls = cn('block w-full overflow-hidden rounded-lg border bg-surface p-5 text-start', active ? 'border-primary' : 'border-hairline', onClick && 'transition-colors duration-1 hover:bg-surface-2');
  if (onClick) {
    return (
      <button type="button" data-testid={testId} onClick={onClick} aria-pressed={active} className={cls}>
        {body}
      </button>
    );
  }
  return (
    <div data-testid={testId} className={cls}>
      {body}
    </div>
  );
}
