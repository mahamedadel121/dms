'use client';

import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';

export function BrandMark({ size = 32, withName = false, className }: { size?: number; withName?: boolean; className?: string }) {
  const { t } = useT();
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden>
        <circle cx="16" cy="16" r="15.5" fill="rgb(var(--primary))" />
        <circle cx="16" cy="16" r="12" fill="none" stroke="rgb(var(--brass))" strokeWidth="1" />
        <text x="16" y="21.5" textAnchor="middle" fill="rgb(var(--on-primary))" style={{ font: '700 15px var(--font-display)' }}>
          د
        </text>
      </svg>
      {withName && <span className="display text-lg text-ink">{t('common.appName')}</span>}
    </span>
  );
}
