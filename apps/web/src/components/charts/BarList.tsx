'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { barWidths } from './chartModel';

export interface BarListRow {
  key: string;
  label: ReactNode;
  value: number;
  valueLabel: ReactNode;
  caption?: ReactNode;
}

/** Horizontal bar list: label at the start, value at the end, a thin track below. Fills anchor to the inline start. */
export function BarList({ rows, tone = 'primary' }: { rows: BarListRow[]; tone?: 'primary' | 'brass' }) {
  const widths = barWidths(rows.map((r) => r.value));
  return (
    <ul className="space-y-3">
      {rows.map((r, i) => (
        <li key={r.key}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-ink">{r.label}</span>
            <span className="num shrink-0 text-sm font-medium text-ink">{r.valueLabel}</span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-2" role="presentation">
            <div className={cn('h-full rounded-full', tone === 'brass' && i === 0 ? 'bg-brass' : 'bg-primary')} style={{ width: `${widths[i]}%` }} />
          </div>
          {r.caption && <div className="mt-0.5 text-xs text-ink-3">{r.caption}</div>}
        </li>
      ))}
    </ul>
  );
}
