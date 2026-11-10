import type { Prisma } from '@prisma/client';
import type { Db } from '../common';
import { toJsonValue } from '../audit';
import { DomainError } from '../errors';

export interface EnqueueInput {
  type: string;
  payload?: object;
  queue?: 'default' | 'telegram';
  runAt?: Date;
  dedupeKey?: string;
  maxAttempts?: number;
  priority?: number;
}

/**
 * Inserts a job row. Call it with the business transaction's client so the job exists iff the
 * change committed (transactional outbox). With `dedupeKey`, an existing key is a no-op and the
 * existing job's id is returned with created=false.
 */
export async function enqueueJob(db: Db, j: EnqueueInput): Promise<{ id: string; created: boolean }> {
  if (!j.type) throw new DomainError('VALIDATION', 'Job type is required');
  const data: Prisma.JobCreateManyInput = {
    type: j.type,
    queue: j.queue ?? 'default',
    payload: toJsonValue(j.payload ?? {}) ?? {},
    runAt: j.runAt ?? new Date(),
    dedupeKey: j.dedupeKey ?? null,
    ...(j.maxAttempts !== undefined ? { maxAttempts: j.maxAttempts } : {}),
    ...(j.priority !== undefined ? { priority: j.priority } : {}),
  };
  if (!j.dedupeKey) {
    const row = await db.job.create({ data, select: { id: true } });
    return { id: row.id, created: true };
  }
  const { count } = await db.job.createMany({ data: [data], skipDuplicates: true });
  const row = await db.job.findUnique({ where: { dedupeKey: j.dedupeKey }, select: { id: true } });
  if (!row) throw new DomainError('CONFLICT', `Job with dedupeKey ${j.dedupeKey} vanished during enqueue`);
  return { id: row.id, created: count === 1 };
}
