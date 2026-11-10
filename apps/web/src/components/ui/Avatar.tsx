'use client';

import { cn } from '@/lib/cn';

const sizeCls = { 24: 'text-[11px]', 32: 'text-xs', 40: 'text-sm' } as const;

export function Avatar({ name, size = 32, className }: { name: string; size?: 24 | 32 | 40; className?: string }) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => Array.from(w)[0] ?? '')
    .join('');
  return (
    <span
      aria-hidden
      style={{ width: size, height: size }}
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full bg-primary-tint font-medium text-primary', sizeCls[size], className)}
    >
      {initials}
    </span>
  );
}
