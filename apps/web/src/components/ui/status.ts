/** Pure status to tone/icon mapping (no React). */
import type { BadgeTone } from './Display';

export type StatusKind = 'request' | 'step' | 'sap' | 'export' | 'version' | 'delegation';

const MAP: Record<StatusKind, Record<string, [BadgeTone, string]>> = {
  request: {
    IN_REVIEW: ['blue', 'Clock3'],
    CORRECTION_REQUESTED: ['amber', 'MessageSquareWarning'],
    APPROVED: ['green', 'Check'],
    PAID: ['navy', 'Banknote'],
    REJECTED: ['red', 'X'],
    CANCELLED: ['gray', 'Ban'],
  },
  step: {
    PENDING: ['gray', 'Circle'],
    ACTIVE: ['blue', 'Clock3'],
    AWAITING_CORRECTION: ['amber', 'MessageSquareWarning'],
    APPROVED: ['green', 'Check'],
    NOT_APPLICABLE: ['gray', 'Minus'],
    REJECTED: ['red', 'X'],
    CANCELLED: ['gray', 'Ban'],
  },
  sap: {
    PENDING: ['gray', 'Clock3'],
    POSTING: ['blue', 'RefreshCw'],
    POSTED: ['green', 'Check'],
    FAILED: ['red', 'AlertTriangle'],
  },
  export: {
    QUEUED: ['gray', 'Clock3'],
    RUNNING: ['blue', 'RefreshCw'],
    DONE: ['green', 'Check'],
    FAILED: ['red', 'AlertTriangle'],
    EXPIRED: ['gray', 'Ban'],
  },
  version: {
    DRAFT: ['amber', 'PencilLine'],
    ACTIVE: ['green', 'Check'],
    ARCHIVED: ['gray', 'Archive'],
  },
  delegation: {
    ACTIVE: ['green', 'Check'],
    UPCOMING: ['blue', 'Clock3'],
    ENDED: ['gray', 'Minus'],
    REVOKED: ['red', 'X'],
  },
};

export function statusTone(kind: StatusKind, status: string): BadgeTone {
  return MAP[kind]?.[status]?.[0] ?? 'gray';
}

export function statusIconName(kind: StatusKind, status: string): string {
  return MAP[kind]?.[status]?.[1] ?? 'Circle';
}
