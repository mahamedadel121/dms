'use client';

import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';

export type SealKind = 'approved' | 'paid' | 'rejected';

export function Seal({ kind, label, sub, size = 104, animate = false, className }: { kind: SealKind; label?: string; sub?: string; size?: number; animate?: boolean; className?: string }) {
  const { t } = useT();
  const text = label ?? t(`ui.seal.${kind}`);
  return (
    <span
      data-testid="seal"
      data-kind={kind}
      aria-label={text}
      role="img"
      className={cn('inline-block select-none opacity-90', kind === 'rejected' ? 'text-danger' : 'text-primary', animate ? 'animate-seal' : '-rotate-[8deg]', className)}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 120 120" width={size} height={size} fill="none" stroke="currentColor">
        <circle cx="60" cy="60" r="56" strokeWidth="2.5" />
        <circle cx="60" cy="60" r="49" strokeWidth="1" />
        <circle cx="60" cy="60" r="40" strokeWidth="1" strokeDasharray="2 3.5" />
        <path d="M20 60l4-4 4 4-4 4z M92 60l4-4 4 4-4 4z" fill="currentColor" stroke="none" />
        <text x="60" y={sub ? 62 : 68} textAnchor="middle" fill="currentColor" stroke="none" style={{ font: '700 22px var(--font-display)' }}>
          {text}
        </text>
        {sub && (
          <text x="60" y="80" textAnchor="middle" fill="currentColor" stroke="none" style={{ font: '500 9px var(--font-mono)' }}>
            {sub}
          </text>
        )}
      </svg>
    </span>
  );
}
