import type { Prisma } from '@prisma/client';
import type { Db, Actor } from '../common';

export interface AuditEntry {
  actor: Actor;
  action: string;
  entityType: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  meta?: unknown;
}

/** Converts any value to something Prisma can store as Json (Decimal/Date/BigInt safe). */
export function toJsonValue(v: unknown): Prisma.InputJsonValue | undefined {
  if (v === undefined || v === null) return undefined;
  const s = JSON.stringify(v, (_k, val) => (typeof val === 'bigint' ? val.toString() : val));
  return s === undefined ? undefined : (JSON.parse(s) as Prisma.InputJsonValue);
}

export async function audit(db: Db, e: AuditEntry): Promise<void> {
  await db.auditLog.create({
    data: {
      actorType: e.actor.type,
      actorUserId: e.actor.userId ?? null,
      actorLabel: e.actor.label ?? (e.actor.type === 'SYSTEM' ? 'system' : null),
      action: e.action,
      entityType: e.entityType,
      entityId: e.entityId ?? null,
      before: toJsonValue(e.before),
      after: toJsonValue(e.after),
      meta: toJsonValue(e.meta),
      ip: e.actor.ip ?? null,
      userAgent: e.actor.userAgent ?? null,
    },
  });
}
