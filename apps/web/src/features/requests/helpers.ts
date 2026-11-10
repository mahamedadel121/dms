import type { RequestDetail, RequestStatus, StepDto, StepStatus } from '../types';

export interface Stage {
  stageIndex: number;
  steps: StepDto[];
  parallel: boolean;
  /** true when every step in the stage is NOT_APPLICABLE */
  skipped: boolean;
}

/** Groups step instances into stages (parallel steps share a stageIndex). */
export function groupStages(steps: StepDto[]): Stage[] {
  const map = new Map<number, StepDto[]>();
  for (const s of steps) {
    const arr = map.get(s.stageIndex) ?? [];
    arr.push(s);
    map.set(s.stageIndex, arr);
  }
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([stageIndex, list]) => ({
      stageIndex,
      steps: list,
      parallel: list.filter((s) => s.status !== 'NOT_APPLICABLE').length > 1 || list.length > 1,
      skipped: list.every((s) => s.status === 'NOT_APPLICABLE'),
    }));
}

export function stepTone(status: StepStatus): 'green' | 'blue' | 'amber' | 'gray' | 'red' | 'slate' {
  switch (status) {
    case 'APPROVED':
      return 'green';
    case 'ACTIVE':
      return 'blue';
    case 'AWAITING_CORRECTION':
      return 'amber';
    case 'REJECTED':
      return 'red';
    case 'NOT_APPLICABLE':
    case 'CANCELLED':
      return 'slate';
    default:
      return 'gray';
  }
}

export function statusTone(status: RequestStatus | string): 'green' | 'blue' | 'amber' | 'gray' | 'red' {
  switch (status) {
    case 'PAID':
    case 'APPROVED':
      return 'green';
    case 'IN_REVIEW':
      return 'blue';
    case 'CORRECTION_REQUESTED':
      return 'amber';
    case 'REJECTED':
      return 'red';
    default:
      return 'gray';
  }
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
};

/** Price per liter: explicit unitPrice, else amount / quantity. Null when not a quantity line. */
export function pricePerLiter(line: { unitPrice?: string | null; quantity?: string | null; amount: string }): number | null {
  const up = num(line.unitPrice);
  if (up !== null) return up;
  const q = num(line.quantity);
  const a = num(line.amount);
  if (q !== null && q > 0 && a !== null) return Math.round((a / q) * 100) / 100;
  return null;
}

export interface OdometerInfo {
  current: number | null;
  last: number | null;
  /** current < last */
  lower: boolean;
  delta: number | null;
}

/** Odometer from the header vs last reading (module supplies one of several keys). */
export function odometerInfo(d: Pick<RequestDetail, 'headerValues' | 'module'>): OdometerInfo {
  const m = (d.module ?? {}) as Record<string, unknown>;
  const current = num(d.headerValues?.odometer ?? m.odometer);
  const last = num(m.lastOdometer ?? m.previousOdometer ?? m.lastReading ?? m.lastOdometerReading);
  return {
    current,
    last,
    lower: current !== null && last !== null && current < last,
    delta: current !== null && last !== null ? current - last : null,
  };
}

export function categoryLabel(c: { nameAr?: string; nameEn?: string } | null | undefined, locale: 'ar' | 'en'): string {
  if (!c) return '';
  return (locale === 'ar' ? c.nameAr || c.nameEn : c.nameEn || c.nameAr) ?? '';
}

/** Minutes waiting since an ISO instant, or null. */
export function waitingHours(since: string | null | undefined, now: number = Date.now()): number | null {
  if (!since) return null;
  const t = new Date(since).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, (now - t) / 3_600_000);
}

export function formatWaiting(hours: number | null, locale: 'ar' | 'en'): string {
  if (hours === null) return '';
  if (hours < 1) {
    const m = Math.max(1, Math.round(hours * 60));
    return locale === 'ar' ? `${m} د` : `${m}m`;
  }
  if (hours < 48) {
    const h = Math.round(hours);
    return locale === 'ar' ? `${h} س` : `${h}h`;
  }
  const d = Math.round(hours / 24);
  return locale === 'ar' ? `${d} يوم` : `${d}d`;
}

/** Event types that deserve a distinct icon/tone on the timeline. */
export function eventTone(type: string): 'green' | 'blue' | 'amber' | 'red' | 'gray' {
  if (/APPROVED|PAID|COMPLETED|SAP_POSTED|PDF_FINALIZED|SUBMITTED/.test(type)) return 'green';
  if (/REJECTED|SAP_FAILED/.test(type)) return 'red';
  if (/CORRECTION|SENT_BACK|DUPLICATE|LOCK_FORCED|EDITED|SUPERSEDED/.test(type)) return 'amber';
  if (/ACTIVATED/.test(type)) return 'blue';
  return 'gray';
}
