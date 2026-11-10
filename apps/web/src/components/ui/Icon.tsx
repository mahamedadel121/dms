'use client';

import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

export function Icon({
  as: Glyph,
  size,
  mirror,
  className,
  label,
}: {
  as: LucideIcon;
  size?: 14 | 16 | 18 | 20 | 24;
  mirror?: boolean;
  className?: string;
  label?: string;
}) {
  return (
    <Glyph
      size={size ?? 18}
      strokeWidth={1.5}
      className={cn('shrink-0', mirror && 'rtl:-scale-x-100', className)}
      aria-hidden={!label}
      aria-label={label}
    />
  );
}
