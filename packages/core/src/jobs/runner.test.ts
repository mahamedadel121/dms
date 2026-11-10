import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupTestDb } from '@dms/db/testing';
import type { PrismaClient } from '@prisma/client';
import { computeBackoffMs, enqueueJob, ensureScheduledJobs, recoverStaleJobs, runDueJobs } from './index';

let prisma: PrismaClient;
let teardown: () => Promise<void>;
beforeAll(async () => {
  const t = await setupTestDb('wp4-jobs');
  prisma = t.prisma;
  teardown = t.teardown;
});
afterAll(async () => {
  await teardown?.();
});

describe('job runner', () => {
  it('two runners process every job exactly once (SKIP LOCKED)', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 30; i++) ids.push((await enqueueJob(prisma, { type: 'test.once', payload: { i } })).id);
    const seen: string[] = [];
    const handlers = {
      'test.once': async (j: { id: string }) => {
        seen.push(j.id);
        await new Promise((r) => setTimeout(r, 5));
      },
    };
    const [a, b] = await Promise.all([
      runDueJobs({ prisma, queues: ['default'], handlers: handlers as never, workerId: 'A' }),
      runDueJobs({ prisma, queues: ['default'], handlers: handlers as never, workerId: 'B' }),
    ]);
    expect(a + b).toBe(30);
    expect(new Set(seen).size).toBe(30);
    expect(seen.length).toBe(30);
    const rows = await prisma.job.findMany({ where: { id: { in: ids } } });
    expect(rows.every((r) => r.status === 'DONE' && r.attempts === 1)).toBe(true);
  });

  it('retries with exponential backoff, then FAILED after maxAttempts', async () => {
    const { id } = await enqueueJob(prisma, { type: 'test.fail', maxAttempts: 2 });
    const handlers = {
      'test.fail': async () => {
        throw new Error('boom');
      },
    };
    expect(await runDueJobs({ prisma, queues: ['default'], handlers })).toBe(1);
    let row = await prisma.job.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe('PENDING');
    expect(row.attempts).toBe(1);
    expect(row.lastError).toContain('boom');
    const delay = row.runAt.getTime() - Date.now();
    expect(delay).toBeGreaterThan(20_000);
    expect(delay).toBeLessThan(40_000);
    // not due yet -> nothing runs
    expect(await runDueJobs({ prisma, queues: ['default'], handlers })).toBe(0);
    await prisma.job.update({ where: { id }, data: { runAt: new Date(Date.now() - 1000) } });
    expect(await runDueJobs({ prisma, queues: ['default'], handlers })).toBe(1);
    row = await prisma.job.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe('FAILED');
    expect(row.attempts).toBe(2);
  });

  it('backoff doubles and caps at one hour', () => {
    const mid = () => 0.5;
    expect(computeBackoffMs(1, mid)).toBe(30_000);
    expect(computeBackoffMs(2, mid)).toBe(60_000);
    expect(computeBackoffMs(3, mid)).toBe(120_000);
    expect(computeBackoffMs(20, mid)).toBe(3_600_000);
  });

  it('recovers stale RUNNING locks', async () => {
    const { id } = await enqueueJob(prisma, { type: 'test.stale' });
    await prisma.job.update({
      where: { id },
      data: { status: 'RUNNING', lockedAt: new Date(Date.now() - 11 * 60_000), lockedBy: 'dead', attempts: 1 },
    });
    expect(await recoverStaleJobs(prisma)).toBe(1);
    const row = await prisma.job.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe('PENDING');
    expect(row.lockedBy).toBeNull();
    let ran = 0;
    await runDueJobs({ prisma, queues: ['default'], handlers: { 'test.stale': async () => void ran++ } });
    expect(ran).toBe(1);
  });

  it('dedupeKey and schedules do not create duplicates; queues are respected', async () => {
    const a = await enqueueJob(prisma, { type: 'x', dedupeKey: 'k1' });
    const b = await enqueueJob(prisma, { type: 'x', dedupeKey: 'k1' });
    expect(b).toEqual({ id: a.id, created: false });
    const now = new Date();
    const s = [{ type: 'sla.scan', everySec: 300 }];
    expect(await ensureScheduledJobs(prisma, s, now)).toBe(1);
    expect(await ensureScheduledJobs(prisma, s, now)).toBe(0);
    await enqueueJob(prisma, { type: 'telegram.send', queue: 'telegram' });
    let n = 0;
    await runDueJobs({ prisma, queues: ['default'], handlers: { 'telegram.send': async () => void n++ } });
    expect(n).toBe(0);
  });

  it('missing handler fails the job without retry', async () => {
    const { id } = await enqueueJob(prisma, { type: 'nobody.handles' });
    await runDueJobs({ prisma, queues: ['default'], handlers: {} });
    expect((await prisma.job.findUniqueOrThrow({ where: { id } })).status).toBe('FAILED');
  });
});
