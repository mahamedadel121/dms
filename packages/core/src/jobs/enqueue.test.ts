import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupTestDb } from '@dms/db/testing';
import type { PrismaClient } from '@prisma/client';
import { enqueueJob } from './index';

let prisma: PrismaClient;
let teardown: () => Promise<void>;

beforeAll(async () => {
  const t = await setupTestDb('wp0b-jobs');
  prisma = t.prisma;
  teardown = t.teardown;
});
afterAll(async () => {
  await teardown?.();
});

describe('enqueueJob', () => {
  it('inserts with defaults', async () => {
    const r = await enqueueJob(prisma, { type: 'sla.scan' });
    expect(r.created).toBe(true);
    const row = await prisma.job.findUniqueOrThrow({ where: { id: r.id } });
    expect(row).toMatchObject({ queue: 'default', status: 'PENDING', attempts: 0, maxAttempts: 8, priority: 0 });
    expect(row.payload).toEqual({});
  });

  it('stores payload, queue, priority, maxAttempts, runAt', async () => {
    const runAt = new Date(Date.now() + 60_000);
    const r = await enqueueJob(prisma, {
      type: 'telegram.send',
      queue: 'telegram',
      payload: { notificationId: 'n1' },
      priority: 5,
      maxAttempts: 3,
      runAt,
    });
    const row = await prisma.job.findUniqueOrThrow({ where: { id: r.id } });
    expect(row.queue).toBe('telegram');
    expect(row.payload).toEqual({ notificationId: 'n1' });
    expect(row.priority).toBe(5);
    expect(row.maxAttempts).toBe(3);
    expect(row.runAt.getTime()).toBe(runAt.getTime());
  });

  it('dedupeKey makes the second enqueue a no-op returning the same id', async () => {
    const a = await enqueueJob(prisma, { type: 'sap.post', payload: { postingId: 'p1' }, dedupeKey: 'sap.post:r1' });
    const b = await enqueueJob(prisma, { type: 'sap.post', payload: { postingId: 'p1' }, dedupeKey: 'sap.post:r1' });
    expect(a.created).toBe(true);
    expect(b.created).toBe(false);
    expect(b.id).toBe(a.id);
    expect(await prisma.job.count({ where: { dedupeKey: 'sap.post:r1' } })).toBe(1);
  });

  it('concurrent enqueues with one key create exactly one row', async () => {
    const res = await Promise.all(
      Array.from({ length: 10 }, () => enqueueJob(prisma, { type: 'pdf.finalize', dedupeKey: 'pdf.finalize:race' })),
    );
    expect(res.filter((r) => r.created)).toHaveLength(1);
    expect(new Set(res.map((r) => r.id)).size).toBe(1);
  });

  it('is transactional: a rolled-back business change leaves no job', async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await enqueueJob(tx, { type: 'x.test', dedupeKey: 'rollback-key' });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await prisma.job.count({ where: { dedupeKey: 'rollback-key' } })).toBe(0);
  });

  it('commits together with the transaction', async () => {
    await prisma.$transaction(async (tx) => {
      await enqueueJob(tx, { type: 'x.test', dedupeKey: 'commit-key' });
    });
    expect(await prisma.job.count({ where: { dedupeKey: 'commit-key' } })).toBe(1);
  });
});
