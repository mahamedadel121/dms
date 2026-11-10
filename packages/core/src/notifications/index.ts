import type { Db } from '../common';
import { DomainError } from '../errors';

// TODO(WP2): implement (in-app rows, role fan-out incl. delegates, telegram jobs).
export interface NotifyBase {
  type: string;
  requestId?: string;
  titleAr: string;
  titleEn?: string;
  bodyAr: string;
  bodyEn?: string;
  data?: Record<string, unknown>;
}

export async function notifyUsers(_db: Db, _n: NotifyBase & { userIds: string[] }): Promise<void> {
  throw new DomainError('NOT_IMPLEMENTED', 'notifyUsers is not implemented yet (WP2)');
}

export async function notifyRole(
  _db: Db,
  _n: NotifyBase & { roleId: string; departmentId?: string | null },
): Promise<void> {
  throw new DomainError('NOT_IMPLEMENTED', 'notifyRole is not implemented yet (WP2)');
}

export async function notifySubmitter(
  _db: Db,
  _n: { submitterId: string; type: string; requestId?: string; bodyAr: string; data?: Record<string, unknown> },
): Promise<void> {
  throw new DomainError('NOT_IMPLEMENTED', 'notifySubmitter is not implemented yet (WP2)');
}
