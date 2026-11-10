import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { setupTestDb } from '@dms/db/testing';
import type { PrismaClient } from '@prisma/client';
import { enqueueJob, runDueJobs } from '@dms/core/jobs';
import { registerEmailTransport, type EmailMessage, type EmailTransport } from '@dms/core/email';
import { createRequestFixture } from '@dms/core/pdf';
import { registerSapAdapter, SapLookupUnavailableError, type SapPostingAdapter } from '@dms/core/sap';
import { createHandlers } from '../src/handlers';

let prisma: PrismaClient;
let teardown: () => Promise<void>;
beforeAll(async () => {
  const t = await setupTestDb('p2-worker-email');
  prisma = t.prisma;
  teardown = t.teardown;
});
afterAll(async () => {
  await teardown?.();
});
afterEach(() => {
  registerEmailTransport(null);
  registerSapAdapter('mock', null);
});

describe('worker: email.send and sap.post force', () => {
  it('email.send delivers through the registered transport', async () => {
    const sent: EmailMessage[] = [];
    const transport: EmailTransport = {
      name: 'fake',
      async send(m) {
        sent.push(m);
        return { messageId: 'fake-1' };
      },
    };
    registerEmailTransport(transport);
    const user = await prisma.user.create({
      data: { username: `wkmail_${Date.now()}`, passwordHash: 'x', fullName: 'Worker Mail', email: 'wk@example.test', locale: 'en' },
    });
    const n = await prisma.notification.create({
      data: {
        channel: 'EMAIL',
        recipientUserId: user.id,
        type: 'REQ_AT_STEP',
        titleAr: 'عنوان',
        titleEn: 'Title',
        bodyAr: 'نص',
        bodyEn: 'Body',
        data: { link: '/requests/1', requestNumber: 'R-9' },
        status: 'PENDING',
      },
    });
    await enqueueJob(prisma, { type: 'email.send', payload: { notificationId: n.id }, dedupeKey: `email.send:${n.id}` });
    await runDueJobs({ prisma, queues: ['default'], handlers: createHandlers() });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe('wk@example.test');
    expect(sent[0]!.subject).toBe('[R-9] Title');
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: n.id } })).status).toBe('SENT');
    expect((await prisma.job.findUniqueOrThrow({ where: { dedupeKey: `email.send:${n.id}` } })).status).toBe('DONE');
  });

  it('email.send without notificationId is fatal', async () => {
    const handlers = createHandlers();
    const job = { id: 'j', type: 'email.send', payload: {} } as never;
    await expect(handlers['email.send']!(job, { prisma } as never)).rejects.toMatchObject({ fatal: true });
  });

  it('sap.post passes force to processSapPosting', async () => {
    const f = await createRequestFixture(prisma, { withSapPosting: true });
    let lookups = 0;
    let posts = 0;
    const adapter: SapPostingAdapter = {
      name: 'mock',
      async post() {
        posts++;
        return { documentNumber: '4900000001', fiscalYear: '2026', companyCode: '1000' };
      },
      async findByReference() {
        lookups++;
        throw new SapLookupUnavailableError('lookup disabled', true);
      },
    };
    registerSapAdapter('mock', adapter);
    // an earlier attempt left the posting in an unknown state, so a normal run would need a lookup
    await prisma.sapPosting.update({ where: { id: f.postingId! }, data: { status: 'POSTING' } });
    await enqueueJob(prisma, {
      type: 'sap.post',
      payload: { postingId: f.postingId, trigger: 'MANUAL', force: true },
      dedupeKey: `sap.post:force:${f.postingId}`,
    });
    await runDueJobs({ prisma, queues: ['default'], handlers: createHandlers() });
    expect((await prisma.sapPosting.findUniqueOrThrow({ where: { id: f.postingId! } })).status).toBe('POSTED');
    expect(lookups).toBe(0);
    expect(posts).toBe(1);
  }, 60_000);
});
