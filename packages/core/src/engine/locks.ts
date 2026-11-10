import type { PrismaClient } from '@prisma/client';
import { hasPermission, type AuthUser } from '../rbac';
import type { Db } from '../common';
import { getSetting } from '../config';
import { DomainError } from '../errors';
import { addEvent, OPEN_STATUSES } from './helpers';
import type { LockInfo } from './types';

async function holderInfo(db: Db, requestId: string): Promise<LockInfo | null> {
  const l = await db.requestLock.findUnique({ where: { requestId }, include: { user: true } });
  if (!l) return null;
  return { requestId, userId: l.userId, userName: l.user.fullName, acquiredAt: l.acquiredAt, expiresAt: l.expiresAt };
}

function lockedError(h: LockInfo): DomainError {
  return new DomainError('LOCKED', `Request is being handled by ${h.userName}`, undefined, {
    userId: h.userId,
    userName: h.userName,
    expiresAt: h.expiresAt,
  });
}

/** Upserts the lock atomically when none exists, it expired or it is ours (PLAN 5.6). */
export async function acquireLockIn(db: Db, requestId: string, userId: string): Promise<boolean> {
  const minutes = await getSetting(db, 'workflow.lockTimeoutMinutes');
  const expires = new Date(Date.now() + minutes * 60_000);
  const rows = await db.$queryRaw<{ requestId: string }[]>`
    INSERT INTO request_locks ("requestId", "userId", "acquiredAt", "heartbeatAt", "expiresAt")
    VALUES (${requestId}, ${userId}, now(), now(), ${expires})
    ON CONFLICT ("requestId") DO UPDATE
      SET "userId" = EXCLUDED."userId",
          "acquiredAt" = CASE WHEN request_locks."userId" = EXCLUDED."userId" THEN request_locks."acquiredAt" ELSE now() END,
          "heartbeatAt" = now(), "expiresAt" = EXCLUDED."expiresAt"
      WHERE request_locks."userId" = EXCLUDED."userId" OR request_locks."expiresAt" < now()
    RETURNING "requestId"`;
  return rows.length > 0;
}

export async function acquireLock(prisma: PrismaClient, requestId: string, user: AuthUser): Promise<LockInfo> {
  const req = await prisma.request.findUnique({ where: { id: requestId }, select: { status: true } });
  if (!req) throw new DomainError('NOT_FOUND', 'Request not found');
  if (!(OPEN_STATUSES as readonly string[]).includes(req.status)) throw new DomainError('INVALID_STATE', 'Request is closed');
  const ok = await acquireLockIn(prisma, requestId, user.id);
  const info = await holderInfo(prisma, requestId);
  if (!ok) throw lockedError(info!);
  return info!;
}

export async function heartbeatLock(prisma: PrismaClient, requestId: string, user: AuthUser): Promise<LockInfo> {
  const cur = await holderInfo(prisma, requestId);
  if (!cur || cur.userId !== user.id || cur.expiresAt < new Date()) {
    // lost or expired: try to (re)acquire; throws LOCKED when someone else took it
    return acquireLock(prisma, requestId, user);
  }
  await acquireLockIn(prisma, requestId, user.id);
  return (await holderInfo(prisma, requestId))!;
}

export async function releaseLock(prisma: PrismaClient, requestId: string, user: AuthUser, force = false): Promise<void> {
  const cur = await prisma.requestLock.findUnique({ where: { requestId } });
  if (!cur) return;
  if (cur.userId === user.id) {
    await prisma.requestLock.deleteMany({ where: { requestId, userId: user.id } });
    return;
  }
  if (!force) {
    if (cur.expiresAt < new Date()) {
      await prisma.requestLock.deleteMany({ where: { requestId, userId: cur.userId } });
      return;
    }
    throw new DomainError('FORBIDDEN', 'The lock belongs to another user');
  }
  if (!hasPermission(user, 'requests.force_unlock')) throw new DomainError('FORBIDDEN', 'requests.force_unlock is required');
  await prisma.$transaction(async (tx) => {
    await tx.requestLock.deleteMany({ where: { requestId } });
    await addEvent(tx, {
      requestId,
      type: 'LOCK_FORCED',
      actor: { type: 'USER', userId: user.id, label: user.username },
      data: { previousHolderId: cur.userId },
    });
  });
}

/** Used by actions: throws LOCKED when another user holds an unexpired lock; otherwise takes/extends ours. */
export async function ensureLockForAction(tx: Db, requestId: string, user: AuthUser): Promise<void> {
  const ok = await acquireLockIn(tx, requestId, user.id);
  if (!ok) throw lockedError((await holderInfo(tx, requestId))!);
}
