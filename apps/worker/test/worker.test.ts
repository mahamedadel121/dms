import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupTestDb } from '@dms/db/testing';
import type { PrismaClient } from '@prisma/client';
import { enqueueJob, ensureScheduledJobs, runDueJobs } from '@dms/core/jobs';
import { closePdfBrowser, createRequestFixture } from '@dms/core/pdf';
import { MockSapAdapter, getSapAdapter } from '@dms/core/sap';
import { createLocalStorage } from '@dms/core/storage';
import { createHandlers, SCHEDULES } from '../src/handlers';

let prisma: PrismaClient;
let teardown: () => Promise<void>;
beforeAll(async () => {
  const t = await setupTestDb('wp4-worker');
  prisma = t.prisma;
  teardown = t.teardown;
});
afterAll(async () => {
  await closePdfBrowser();
  await teardown?.();
});

describe('worker handlers', () => {
  it('sap.post + pdf.finalize jobs run to DONE and are idempotent', async () => {
    const storage = createLocalStorage(mkdtempSync(join(tmpdir(), 'dms-wk-')));
    const f = await createRequestFixture(prisma, { withSapPosting: true, storage });
    await enqueueJob(prisma, { type: 'sap.post', payload: { postingId: f.postingId }, dedupeKey: `sap.post:${f.requestId}` });
    await enqueueJob(prisma, { type: 'pdf.finalize', payload: { requestId: f.requestId }, dedupeKey: `pdf.finalize:${f.requestId}` });
    // duplicate enqueue is a no-op
    expect((await enqueueJob(prisma, { type: 'sap.post', payload: {}, dedupeKey: `sap.post:${f.requestId}` })).created).toBe(false);
    const handlers = createHandlers({ storage: () => storage });
    expect(await runDueJobs({ prisma, queues: ['default'], handlers })).toBe(2);
    expect((await prisma.sapPosting.findUniqueOrThrow({ where: { id: f.postingId } })).status).toBe('POSTED');
    expect(await prisma.requestDocument.count({ where: { requestId: f.requestId } })).toBe(1);
    expect((getSapAdapter('mock') as MockSapAdapter).ledger.size).toBe(1);
    expect(await prisma.job.count({ where: { status: 'DONE' } })).toBe(2);
  }, 90_000);

  it('schedules insert sla.scan / sweeps once per bucket and the handlers consume them', async () => {
    const storage = createLocalStorage(mkdtempSync(join(tmpdir(), 'dms-wk-')));
    const now = new Date();
    expect(await ensureScheduledJobs(prisma, SCHEDULES, now)).toBe(3);
    expect(await ensureScheduledJobs(prisma, SCHEDULES, now)).toBe(0);
    await runDueJobs({ prisma, queues: ['default'], handlers: createHandlers({ storage: () => storage }) });
    const types = (await prisma.job.findMany({ where: { type: { in: ['sla.scan', 'bot.draft_sweep', 'exports.sweep'] } } })).map((j) => `${j.type}:${j.status}`).sort();
    expect(types).toEqual(['bot.draft_sweep:DONE', 'exports.sweep:DONE', 'sla.scan:DONE']);
  });
});
