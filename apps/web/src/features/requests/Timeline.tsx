'use client';

import { useTr } from '../common/useTr';
import { formatDateTime } from '@/lib/format';
import { eventTone } from './helpers';
import type { CorrectionDto, EventDto } from '../types';

const dot: Record<ReturnType<typeof eventTone>, string> = {
  green: 'bg-green-500',
  blue: 'bg-blue-500',
  amber: 'bg-amber-500',
  red: 'bg-red-500',
  gray: 'bg-slate-400',
};

function describeData(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const d = data as Record<string, unknown>;
  const parts: string[] = [];
  if (d.field !== undefined) parts.push(`${String(d.field)}: ${String(d.oldValue ?? d.old ?? '')} → ${String(d.newValue ?? d.new ?? '')}`);
  else if (d.oldAmount !== undefined || d.newAmount !== undefined) parts.push(`${String(d.oldAmount ?? '')} → ${String(d.newAmount ?? '')}`);
  if (d.reason && typeof d.reason === 'string') parts.push(d.reason);
  return parts.join(' · ');
}

export function Timeline({ events, corrections }: { events: EventDto[]; corrections?: CorrectionDto[] }) {
  const { t } = useTr();
  const sorted = [...events].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const open = (corrections ?? []).filter((c) => c.status === 'OPEN');
  return (
    <div className="space-y-3">
      {open.length > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">
          <p className="font-semibold">{t('requests.timeline.openCorrections', { n: open.length })}</p>
          <ul className="mt-1 list-disc ps-5">
            {open.map((c) => (
              <li key={c.id}>
                {c.comment} {c.requestedByName ? `— ${c.requestedByName}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
      <ol className="relative ms-3 border-s border-slate-200">
        {sorted.map((e) => {
          const extra = describeData(e.data);
          return (
            <li key={e.id} className="mb-4 ms-4">
              <span className={`absolute -start-1.5 mt-1.5 h-3 w-3 rounded-full border border-white ${dot[eventTone(e.type)]}`} />
              <p className="text-sm font-semibold text-slate-800">{t(`requests.event.${e.type}`)}</p>
              <p className="text-xs text-slate-500">
                {e.actorName ?? t(e.actorType === 'SYSTEM' ? 'requests.timeline.system' : 'requests.timeline.unknown')} · {formatDateTime(e.createdAt)}
              </p>
              {e.comment && <p className="mt-0.5 whitespace-pre-wrap text-sm text-slate-700">{e.comment}</p>}
              {extra && <p className="mt-0.5 text-xs text-slate-600">{extra}</p>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
