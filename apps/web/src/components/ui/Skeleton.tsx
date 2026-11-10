'use client';

import { cn } from '@/lib/cn';

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} aria-hidden />;
}

export function SkeletonRows({ rows = 6, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div aria-busy="true" data-testid="skeleton-rows">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex h-row items-center gap-4 border-b border-hairline px-4 last:border-b-0">
          {Array.from({ length: cols }).map((__, c) => (
            <Skeleton key={c} className={cn('h-3', c === 0 ? 'w-24' : 'flex-1')} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div aria-busy="true" className="space-y-3 rounded-lg border border-hairline bg-surface p-5">
      <Skeleton className="h-4 w-1/3" />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={cn('h-3', i === lines - 1 ? 'w-2/3' : 'w-full')} />
      ))}
    </div>
  );
}
