// `telegram.send` job handler: the only code that pushes notifications to drivers (the bot holds the token).
import { GrammyError } from 'grammy';
import type { PrismaClient } from '@dms/db';
import type { JobHandler } from '@dms/core/jobs';
import { getConfig } from '@dms/core/config';
import { BTN } from './messages';

export interface TelegramApi {
  sendMessage(chatId: number | string, text: string, other?: Record<string, unknown>): Promise<unknown>;
}

export function createTelegramSendHandler(api: TelegramApi): JobHandler {
  return async (job, { prisma }: { prisma: PrismaClient }) => {
    const payload = (job.payload ?? {}) as { notificationId?: string };
    if (!payload.notificationId) return { skipped: 'no notificationId' };
    const n = await prisma.notification.findUnique({ where: { id: payload.notificationId } });
    if (!n) return { skipped: 'notification not found' };
    if (n.status === 'SENT' || n.status === 'SKIPPED') return { skipped: n.status }; // idempotent
    if (n.recipientUserId && !n.recipientSubmitterId) return sendToUser(api, prisma, n);
    const sub = n.recipientSubmitterId
      ? await prisma.submitter.findUnique({ where: { id: n.recipientSubmitterId } })
      : null;
    const chatId = sub?.telegramChatId ?? sub?.telegramUserId ?? null;
    if (!sub || chatId === null) {
      await prisma.notification.update({ where: { id: n.id }, data: { status: 'SKIPPED', error: 'no telegram chat id' } });
      return { skipped: 'no chat' };
    }

    const data = (n.data ?? {}) as { correctionRequestIds?: string[] };
    const other: Record<string, unknown> = {};
    if (Array.isArray(data.correctionRequestIds) && data.correctionRequestIds.length) {
      other.reply_markup = {
        inline_keyboard: data.correctionRequestIds.slice(0, 5).map((id) => [{ text: 'صحّح دلوقتي', callback_data: `corr:${id}` }]),
      };
    } else if (n.type === 'VCR_DECIDED') {
      other.reply_markup = {
        keyboard: [[{ text: BTN.newRequest }], [{ text: BTN.myRequests }]],
        resize_keyboard: true,
        is_persistent: true,
      };
    }

    try {
      await api.sendMessage(Number(chatId), n.bodyAr, other);
    } catch (e) {
      if (e instanceof GrammyError && (e.error_code === 403 || e.error_code === 400)) {
        // bot blocked / chat gone: retrying will not help
        await prisma.notification.update({ where: { id: n.id }, data: { status: 'FAILED', error: e.description } });
        return { failed: e.description };
      }
      throw e; // transient: the job runner retries with backoff
    }
    await prisma.notification.update({ where: { id: n.id }, data: { status: 'SENT', sentAt: new Date(), error: null } });

    if (n.type === 'VCR_DECIDED' && sub.telegramUserId !== null) {
      // the driver is no longer blocked: leave VCR_PENDING
      await prisma.botSession.updateMany({
        where: { telegramUserId: sub.telegramUserId, state: 'VCR_PENDING' },
        data: { state: 'IDLE' },
      });
    }
    return { sent: true };
  };
}

async function sendToUser(
  api: TelegramApi,
  prisma: PrismaClient,
  n: NonNullable<Awaited<ReturnType<PrismaClient['notification']['findUnique']>>>,
): Promise<Record<string, unknown>> {
  const user = await prisma.user.findUnique({ where: { id: n.recipientUserId! } });
  const chatId = user?.telegramChatId ?? user?.telegramUserId ?? null;
  if (!user || chatId === null) {
    await prisma.notification.update({ where: { id: n.id }, data: { status: 'SKIPPED', error: 'no telegram chat id' } });
    return { skipped: 'no chat' };
  }
  const data = (n.data ?? {}) as { link?: unknown };
  const link = typeof data.link === 'string' && data.link.startsWith('/') ? getConfig().WEB_PUBLIC_URL + data.link : undefined;
  const text = [n.titleAr, n.bodyAr, link].filter(Boolean).join('\n');
  try {
    await api.sendMessage(Number(chatId), text);
  } catch (e) {
    if (e instanceof GrammyError && (e.error_code === 403 || e.error_code === 400)) {
      await prisma.notification.update({ where: { id: n.id }, data: { status: 'FAILED', error: e.description } });
      return { failed: e.description };
    }
    throw e;
  }
  await prisma.notification.update({ where: { id: n.id }, data: { status: 'SENT', sentAt: new Date(), error: null } });
  return { sent: true };
}
