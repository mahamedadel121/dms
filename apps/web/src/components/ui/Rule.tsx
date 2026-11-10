'use client';

import { cn } from '@/lib/cn';

export function Rule({ variant = 'double', className }: { variant?: 'double' | 'brass' | 'hairline'; className?: string }) {
  if (variant === 'brass') return <div className={cn('h-px bg-brass', className)} />;
  if (variant === 'hairline') return <div className={cn('h-px bg-hairline', className)} />;
  return <div className={cn('rule-double', className)} />;
}
