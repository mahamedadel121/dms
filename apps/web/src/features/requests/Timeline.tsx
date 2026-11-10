'use client';

import { useMemo, useState } from 'react';
import { Check, ChevronDown, Dot, FileText, Lock, MessageSquareWarning, PencilLine, Send, Server, X, type LucideIcon } from 'lucide-react';
import { Banner, DateText } from '@/components/ui';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/cn';
import { formatDay, formatTime } from '@/lib/format';
import { useMediaQuery } from '@/lib/useMediaQuery';
import { useTr } from '../common/useTr';
import { eventTone } from './helpers';
import { collapseEvents, groupByDay, type TimelineItem } from './timelineModel';
import type { CorrectionDto, EventDto } from '../types';

const disc: Record<ReturnType<typeof eventTone>, string> = {
  green: 'bg-success-bg text-success',
  blue: 'bg-info-bg text-info',
  amber: 'bg-warning-bg text-warning',
  red: 'bg-danger-bg text-danger',
  gray: 'bg-surface-3 text-ink-3',
};

function eventIcon(type: string): { icon: LucideIcon; mirror?: boolean } {
  if (type === 'SUBMITTED') return { icon: Send, mirror: true };
  if (/REJECTED/.test(type)) return { icon: X };
  if (/CORRECTION|SENT_BACK/.test(type)) return { icon: MessageSquareWarning };
  if (/EDITED|SUPERSEDED/.test(type)) return { icon: PencilLine };
  if (/APPROVED|PAID|COMPLETED/.test(type)) return { icon: Check };
  if (/^SAP_/.test(type)) return { icon: Server };
  if (/PDF/.test(type)) return { icon: FileText };
  if (/LOCK/.test(type)) return { icon: Lock };
  return { icon: Dot };
}

function describeData(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const d = data as Record<string, unknown>;
  const parts: string[] = [];
  if (d.field !== undefined) parts.push(`${String(d.field)}: ${String(d.oldValue ?? d.old ?? '')} → ${String(d.newValue ?? d.new ?? '')}`);
  else if (d.oldAmount !== undefined || d.newAmount !== undefined) parts.push(`${String(d.oldAmount ?? '')} → ${String(d.newAmount ?? '')}`);
  if (d.reason && typeof d.reason === 'string') parts.push(d.reason);
  return parts.join(' · ');
}

function EventRow({ e }: { e: EventDto }) {
  const { t } = useTr();
  const extra = describeData(e.data);
  const { icon, mirror } = eventIcon(e.type);
  return (
    <li className="relative flex gap-3 pb-4">
      <span className={cn('z-[1] flex h-6 w-6 shrink-0 items-center justify-center rounded-full', disc[eventTone(e.type)])}>
        <Icon as={icon} size={14} mirror={mirror} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink">{t(`requests.event.${e.type}`)}</p>
        <p className="text-xs text-ink-3">
          {e.actorName ?? t(e.actorType === 'SYSTEM' ? 'requests.timeline.system' : 'requests.timeline.unknown')} · <span className="num">{formatTime(e.createdAt)}</span>
        </p>
        {e.comment && (
          <blockquote dir="auto" className="mt-1 whitespace-pre-wrap border-s-2 border-line ps-3 text-sm text-ink-2">
            {e.comment}
          </blockquote>
        )}
        {extra && <p className="mt-0.5 text-xs text-ink-3">{extra}</p>}
      </div>
    </li>
  );
}

function SkippedRow({ item }: { item: Extract<TimelineItem, { kind: 'skipped' }> }) {
  const { t } = useTr();
  const [open, setOpen] = useState(false);
  return (
    <li className="relative pb-4">
      <div className="flex gap-3">
        <span className="z-[1] flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-3 text-ink-disabled">
          <Icon as={Dot} size={14} />
        </span>
        <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="inline-flex items-center gap-1 text-sm text-ink-3">
          {t('requests.timeline.skipped', { n: item.count })}
          <Icon as={ChevronDown} size={14} className={open ? 'rotate-180' : ''} />
        </button>
      </div>
      {open && (
        <ul className="ms-9 mt-1 space-y-0.5 text-xs text-ink-3">
          {item.events.map((e) => (
            <li key={e.id}>
              {t(`requests.event.${e.type}`)} · <span className="num">{formatTime(e.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export function Timeline({ events, corrections }: { events: EventDto[]; corrections?: CorrectionDto[] }) {
  const { t, locale } = useTr();
  const wide = useMediaQuery('(min-width: 768px)');
  const [open, setOpen] = useState(false);
  const open_ = (corrections ?? []).filter((c) => c.status === 'OPEN');
  const groups = useMemo(() => groupByDay(collapseEvents(events), (iso) => formatDay(iso, locale, 'long')), [events, locale]);
  const visible = wide || open;

  return (
    <div data-testid="timeline" className="space-y-3">
      {!wide && (
        <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="inline-flex items-center gap-1 text-sm font-medium text-ink-2">
          {t('requests.timeline.title')} (<span className="num">{events.length}</span>)
          <Icon as={ChevronDown} size={16} className={open ? 'rotate-180' : ''} />
        </button>
      )}
      {visible && open_.length > 0 && (
        <Banner tone="warning">
          <p className="font-medium">{t('requests.timeline.openCorrections', { n: open_.length })}</p>
          <ul className="mt-1 list-disc ps-5">
            {open_.map((c) => (
              <li key={c.id} dir="auto">
                {c.comment} {c.requestedByName ? `— ${c.requestedByName}` : ''}
              </li>
            ))}
          </ul>
        </Banner>
      )}
      {visible &&
        groups.map((g) => (
          <div key={g.day}>
            <div className="sticky top-topbar z-sticky bg-surface py-1 text-xs font-medium text-ink-3">
              <DateText value={g.items[0]?.at} mode="long" />
            </div>
            <ol className="relative mt-2 before:absolute before:inset-y-0 before:start-3 before:w-px before:bg-hairline">
              {g.items.map((it) =>
                it.kind === 'skipped' ? <SkippedRow key={it.events[0]?.id} item={it} /> : <EventRow key={it.event.id} e={it.event} />,
              )}
            </ol>
          </div>
        ))}
    </div>
  );
}
