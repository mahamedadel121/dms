import type { EventDto } from '../types';

export type TimelineItem =
  | { kind: 'event'; at: string; event: EventDto; /** events folded into this one (same-second repeated arrivals) */ folded: EventDto[] }
  | { kind: 'skipped'; at: string; count: number; events: EventDto[] };

const ARRIVAL = new Set(['STEP_ACTIVATED', 'REQ_AT_STEP']);
const SKIPPED = 'STEP_NOT_APPLICABLE';

const second = (iso: string): number => Math.floor(new Date(iso).getTime() / 1000);

/**
 * Collapses noise in the event list (sorted ascending by time):
 * - consecutive STEP_NOT_APPLICABLE events become one `skipped` item (a single one is a group of one);
 * - an arrival event that immediately follows another arrival within the same second is folded into the first.
 */
export function collapseEvents(events: EventDto[]): TimelineItem[] {
  const sorted = [...events].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const out: TimelineItem[] = [];
  for (const e of sorted) {
    const last = out[out.length - 1];
    if (e.type === SKIPPED) {
      if (last && last.kind === 'skipped') {
        last.events.push(e);
        last.count += 1;
      } else {
        out.push({ kind: 'skipped', at: e.createdAt, count: 1, events: [e] });
      }
      continue;
    }
    if (ARRIVAL.has(e.type) && last && last.kind === 'event' && ARRIVAL.has(last.event.type) && second(last.event.createdAt) === second(e.createdAt)) {
      last.folded.push(e);
      continue;
    }
    out.push({ kind: 'event', at: e.createdAt, event: e, folded: [] });
  }
  return out;
}

/** Groups items by the day label returned by `formatDay(iso)`; days come out in ascending order. */
export function groupByDay<T extends { at: string }>(items: T[], formatDay: (iso: string) => string): { day: string; items: T[] }[] {
  const sorted = [...items].sort((a, b) => a.at.localeCompare(b.at));
  const groups: { day: string; items: T[] }[] = [];
  for (const it of sorted) {
    const day = formatDay(it.at);
    const g = groups[groups.length - 1];
    if (g && g.day === day) g.items.push(it);
    else groups.push({ day, items: [it] });
  }
  return groups;
}
