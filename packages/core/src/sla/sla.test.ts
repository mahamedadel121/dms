import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupTestDb } from '@dms/db/testing';
import type { PrismaClient } from '@prisma/client';
import { createRequestFixture } from '../pdf/fixtures';
import { runSlaScan, sweepBotDrafts, sweepExports } from './index';

let prisma: PrismaClient;
let teardown: () => Promise<void>;
beforeAll(async () => {
  const t = await setupTestDb('wp4-sla');
  prisma = t.prisma;
  teardown = t.teardown;
});
afterAll(async () => {
  await teardown?.();
});

describe('sla.scan', () => {
  it('reminds role holders once per interval and bumps lastReminderAt / reminderCount', async () => {
    const f = await createRequestFixture(prisma, { status: 'IN_REVIEW', approvedUpTo: 1 });
    const active = await prisma.requestStepInstance.findFirstOrThrow({ where: { requestId: f.requestId, status: 'ACTIVE' } });
    await prisma.requestStepInstance.update({ where: { id: active.id }, data: { dueAt: new Date(Date.now() - 3 * 3_600_000) } });

    const t0 = new Date();
    expect((await runSlaScan(prisma, t0)).reminded).toBe(1);
    const holders = await prisma.userRole.count({ where: { roleId: active.roleId, user: { isActive: true } } });
    const n1 = await prisma.notification.count({ where: { type: 'SLA_REMINDER', requestId: f.requestId } });
    expect(n1).toBe(holders);
    const si = await prisma.requestStepInstance.findUniqueOrThrow({ where: { id: active.id } });
    expect(si.reminderCount).toBe(1);
    expect(si.lastReminderAt).not.toBeNull();

    // same interval: nothing
    expect((await runSlaScan(prisma, new Date(t0.getTime() + 3_600_000))).reminded).toBe(0);
    expect(await prisma.notification.count({ where: { type: 'SLA_REMINDER', requestId: f.requestId } })).toBe(n1);

    // after the 4 h interval: again
    expect((await runSlaScan(prisma, new Date(t0.getTime() + 4.1 * 3_600_000))).reminded).toBe(1);
    expect(await prisma.notification.count({ where: { type: 'SLA_REMINDER', requestId: f.requestId } })).toBe(n1 * 2);
    expect((await prisma.requestStepInstance.findUniqueOrThrow({ where: { id: active.id } })).reminderCount).toBe(2);
  });

  it('ignores instances not yet due and non-active ones', async () => {
    const f = await createRequestFixture(prisma, { status: 'IN_REVIEW', approvedUpTo: 1 });
    const r = await runSlaScan(prisma, new Date('2000-01-01'));
    expect(r.reminded).toBe(0);
    expect(await prisma.notification.count({ where: { type: 'SLA_REMINDER', requestId: f.requestId } })).toBe(0);
  });

  it('concurrent scans remind only once', async () => {
    const f = await createRequestFixture(prisma, { status: 'IN_REVIEW', approvedUpTo: 2 });
    const active = await prisma.requestStepInstance.findFirstOrThrow({ where: { requestId: f.requestId, status: 'ACTIVE' } });
    await prisma.requestStepInstance.update({ where: { id: active.id }, data: { dueAt: new Date(Date.now() - 3_600_000) } });
    const now = new Date();
    const rs = await Promise.all([runSlaScan(prisma, now), runSlaScan(prisma, now)]);
    expect((await prisma.requestStepInstance.findUniqueOrThrow({ where: { id: active.id } })).reminderCount).toBe(1);
    expect(rs.reduce((a, r) => a + r.reminded, 0)).toBeGreaterThanOrEqual(1);
  });
});

describe('bot.draft_sweep + exports.sweep', () => {
  it('reminds once, then expires the draft and deletes draft attachments', async () => {
    const sub = await prisma.submitter.findUniqueOrThrow({ where: { code: 'DRV002' } });
    const now = new Date();
    const s = await prisma.botSession.create({
      data: {
        telegramUserId: 555001n,
        chatId: 555001n,
        submitterId: sub.id,
        state: 'PHOTOS',
        draft: { lines: [] },
        draftStartedAt: new Date(now.getTime() - 7 * 3_600_000),
        draftUpdatedAt: new Date(now.getTime() - 7 * 3_600_000),
        draftExpiresAt: new Date(now.getTime() + 17 * 3_600_000),
      },
    });
    const deleted: string[] = [];
    const storage = { delete: async (k: string) => void deleted.push(k) } as never;
    await prisma.attachment.create({
      data: { botSessionId: s.id, storageKey: 'attachments/2026/03/x.jpg', thumbKey: 'thumbs/2026/03/x.jpg', mimeType: 'image/jpeg', sizeBytes: 10, sha256: 'a'.repeat(64) },
    });

    expect(await sweepBotDrafts(prisma, storage, now)).toEqual({ reminded: 1, expired: 0 });
    expect(await sweepBotDrafts(prisma, storage, now)).toEqual({ reminded: 0, expired: 0 });
    expect(await prisma.notification.count({ where: { type: 'DRAFT_REMINDER', recipientSubmitterId: sub.id } })).toBe(1);

    const later = new Date(now.getTime() + 18 * 3_600_000);
    expect(await sweepBotDrafts(prisma, storage, later)).toEqual({ reminded: 0, expired: 1 });
    const after = await prisma.botSession.findUniqueOrThrow({ where: { id: s.id } });
    expect(after.draft).toBeNull();
    expect(after.state).toBe('IDLE');
    expect(after.draftExpiresAt).toBeNull();
    expect(await prisma.attachment.count({ where: { botSessionId: s.id } })).toBe(0);
    expect(deleted.sort()).toEqual(['attachments/2026/03/x.jpg', 'thumbs/2026/03/x.jpg']);
    expect(await prisma.notification.count({ where: { type: 'DRAFT_EXPIRED', recipientSubmitterId: sub.id } })).toBe(1);
  });

  it('expires old exports', async () => {
    const admin = await prisma.user.findUniqueOrThrow({ where: { username: 'admin' } });
    const e = await prisma.reportExport.create({
      data: { requestedById: admin.id, kind: 'EXCEL', filters: {}, status: 'DONE', storageKey: 'exports/e1/a.xlsx', expiresAt: new Date(Date.now() - 1000) },
    });
    const deleted: string[] = [];
    expect(await sweepExports(prisma, { delete: async (k: string) => void deleted.push(k) } as never)).toEqual({ expired: 1 });
    expect((await prisma.reportExport.findUniqueOrThrow({ where: { id: e.id } })).status).toBe('EXPIRED');
    expect(deleted).toEqual(['exports/e1/a.xlsx']);
  });
});
