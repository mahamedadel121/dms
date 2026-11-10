'use client';

import { formatNumber } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { niceMax } from './chartModel';

export interface ColumnDatum {
  period: string;
  total: string;
  count: number;
}

const H = 220;
const TOP = 24;
const BOTTOM = 28;
const PLOT = H - TOP - BOTTOM;
const W = 640;

/** Inline-SVG column chart, time runs left to right. */
export function ColumnChart({ data }: { data: ColumnDatum[] }) {
  const { locale } = useT();
  const unit = locale === 'ar' ? 'ج.م' : 'EGP';
  const values = data.map((d) => Number(d.total) || 0);
  const max = niceMax(Math.max(0, ...values));
  const slot = W / Math.max(1, data.length);
  const colW = data.length === 1 ? 64 : Math.min(64, slot * 0.6);
  const lines = [0, 1, 2, 3].map((i) => TOP + (PLOT * i) / 3);
  return (
    <div dir="ltr" className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" preserveAspectRatio="xMidYMid meet">
        {lines.map((y) => (
          <line key={y} x1={0} x2={W} y1={y} y2={y} style={{ stroke: 'rgb(var(--hairline))' }} strokeWidth={1} />
        ))}
        <line x1={0} x2={W} y1={TOP + PLOT} y2={TOP + PLOT} style={{ stroke: 'rgb(var(--hairline))' }} strokeWidth={1} />
        {data.map((d, i) => {
          const h = Math.max(values[i]! > 0 ? 2 : 0, (values[i]! / max) * PLOT);
          const cx = slot * i + slot / 2;
          const x = cx - colW / 2;
          const y = TOP + PLOT - h;
          const latest = i === data.length - 1;
          const full = `${d.period}: ${formatNumber(d.total)} ${unit} (${d.count})`;
          return (
            <g key={d.period}>
              <title>{full}</title>
              <path
                d={`M${x},${y + h} V${y + Math.min(3, h)} Q${x},${y} ${x + Math.min(3, h)},${y} H${x + colW - Math.min(3, h)} Q${x + colW},${y} ${x + colW},${y + Math.min(3, h)} V${y + h} Z`}
                style={{ fill: latest ? 'rgb(var(--brass))' : 'rgb(var(--primary))' }}
              />
              <text x={cx} y={y - 6} textAnchor="middle" style={{ font: '500 12px var(--font-sans)', fill: 'rgb(var(--ink-2))' }}>
                {formatNumber(d.total, 0)}
              </text>
              <text x={cx} y={H - 8} textAnchor="middle" style={{ font: '400 12px var(--font-sans)', fill: 'rgb(var(--ink-3))' }}>
                {d.period}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
