import type { PrismaClient } from '@prisma/client';
import { getSetting } from '../config';
import { notifySubmitter } from '../notifications';
import type { StorageAdapter } from '../storage';

/**
 * Job bot.draft_sweep (every 15 min).
 * - reminder once, `bot.draftReminderHours` after the last draft activity
 * - expiry at `draftExpiresAt`: delete draft attachments (rows + files), clear the draft, state -> IDLE, notify
 */
export async function sweepBotDrafts(
  prisma: PrismaClient,
  storage: StorageAdapter | undefined,
  now = new Date(),
): Promise<{ reminded: number; expired: number }> {
  const reminderH = await getSetting(prisma, 'bot.draftReminderHours');
  let expired = 0;
  let reminded = 0;

  const toExpire = await prisma.botSession.findMany({
    where: { draftExpiresAt: { lt: now }, NOT: { draftStartedAt: null } },
    take: 200,
  });
  for (const s of toExpire) {
    const atts = await prisma.attachment.findMany({
      where: { botSessionId: s.id, requestId: null },
      select: { id: true, storageKey: true, thumbKey: true },
    });
    for (const a of atts) {
      for (const k of [a.storageKey, a.thumbKey]) {
        if (k && storage) await storage.delete(k).catch(() => undefined);
      }
    }
    await prisma.$transaction(async (tx) => {
      await tx.attachment.deleteMany({ where: { id: { in: atts.map((a) => a.id) } } });
      await tx.botSession.update({
        where: { id: s.id },
        data: {
          state: s.submitterId ? 'IDLE' : s.state,
          draftStartedAt: null,
          draftUpdatedAt: null,
          draftExpiresAt: null,
          draftReminderSentAt: null,
        },
      });
      // Prisma cannot set a Json? column to SQL NULL through `undefined`; do it explicitly
      await tx.$executeRaw`UPDATE bot_sessions SET draft = NULL WHERE id = ${s.id}`;
      if (s.submitterId) {
        await notifySubmitter(tx, {
          submitterId: s.submitterId,
          type: 'DRAFT_EXPIRED',
          bodyAr: 'المسودة بتاعتك انتهت بسبب عدم النشاط. ابدأ طلب جديد من القائمة.',
        });
      }
    });
    expired++;
  }

  const reminderBefore = new Date(now.getTime() - reminderH * 3_600_000);
  const toRemind = await prisma.botSession.findMany({
    where: {
      submitterId: { not: null },
      NOT: { draftStartedAt: null },
      draftUpdatedAt: { lt: reminderBefore },
      OR: [{ draftExpiresAt: null }, { draftExpiresAt: { gt: now } }],
      draftReminderSentAt: null,
    },
    take: 200,
  });
  for (const s of toRemind) {
    await prisma.$transaction(async (tx) => {
      const claim = await tx.botSession.updateMany({
        where: { id: s.id, draftReminderSentAt: null },
        data: { draftReminderSentAt: now },
      });
      if (claim.count !== 1) return;
      await notifySubmitter(tx, {
        submitterId: s.submitterId!,
        type: 'DRAFT_REMINDER',
        bodyAr: 'عندك طلب مصروفات لسه ما اتبعتش. كمّله من القائمة قبل ما المسودة تنتهي.',
      });
      reminded++;
    });
  }
  return { reminded, expired };
}

/** Job exports.sweep (hourly): DONE exports past `expiresAt` become EXPIRED and their file is deleted. */
export async function sweepExports(
  prisma: PrismaClient,
  storage: StorageAdapter | undefined,
  now = new Date(),
): Promise<{ expired: number }> {
  const rows = await prisma.reportExport.findMany({
    where: { status: 'DONE', expiresAt: { lt: now } },
    take: 200,
  });
  for (const r of rows) {
    if (r.storageKey && storage) await storage.delete(r.storageKey).catch(() => undefined);
    await prisma.reportExport.update({ where: { id: r.id }, data: { status: 'EXPIRED', storageKey: null } });
  }
  return { expired: rows.length };
}
