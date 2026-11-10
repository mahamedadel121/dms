import type { Db } from '../common';
import { enqueueJob } from '../jobs/enqueue';
import { toJsonValue } from '../audit';
import { DomainError } from '../errors';
import { getConfig, getSetting } from '../config';

export { submitterMessages, userMessages } from './messages';

export interface NotifyBase {
  type: string;
  requestId?: string;
  titleAr: string;
  titleEn?: string;
  bodyAr: string;
  bodyEn?: string;
  data?: Record<string, unknown>;
}

/** In-app notification rows (created as SENT) for each distinct user id. */
export async function notifyUsers(db: Db, n: NotifyBase & { userIds: string[] }): Promise<void> {
  const ids = [...new Set(n.userIds.filter(Boolean))];
  if (ids.length === 0) return;
  await db.notification.createMany({
    data: ids.map((userId) => ({
      channel: 'IN_APP' as const,
      recipientUserId: userId,
      type: n.type,
      requestId: n.requestId ?? null,
      titleAr: n.titleAr,
      titleEn: n.titleEn ?? null,
      bodyAr: n.bodyAr,
      bodyEn: n.bodyEn ?? null,
      data: toJsonValue(n.data),
      status: 'SENT' as const,
      sentAt: new Date(),
    })),
  });
  try {
    await fanOutUserChannels(db, n, ids);
  } catch (e) {
    console.warn('notification fan-out failed', e);
  }
}

/** E-mail and Telegram rows + outbox jobs for users, according to the notification settings. */
export async function fanOutUserChannels(db: Db, n: NotifyBase, userIds: string[]): Promise<{ email: number; telegram: number }> {
  const out = { email: 0, telegram: 0 };
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) return out;
  const matches = (types: string[]) => types.includes('*') || types.includes(n.type);
  const row = (channel: 'EMAIL' | 'TELEGRAM', recipientUserId: string) => ({
    channel,
    recipientUserId,
    type: n.type,
    requestId: n.requestId ?? null,
    titleAr: n.titleAr,
    titleEn: n.titleEn ?? null,
    bodyAr: n.bodyAr,
    bodyEn: n.bodyEn ?? null,
    data: toJsonValue(n.data),
    status: 'PENDING' as const,
  });

  if (getConfig().EMAIL_DRIVER !== 'none') {
    const cfg = await getSetting(db, 'notifications.email');
    if (cfg.enabled && matches(cfg.types)) {
      const users = await db.user.findMany({
        where: { id: { in: ids }, isActive: true, email: { not: null } },
        select: { id: true, email: true },
      });
      for (const u of users) {
        if (!u.email || !u.email.trim()) continue;
        const created = await db.notification.create({ data: row('EMAIL', u.id), select: { id: true } });
        await enqueueJob(db, { type: 'email.send', payload: { notificationId: created.id }, dedupeKey: `email.send:${created.id}` });
        out.email++;
      }
    }
  }

  const tg = await getSetting(db, 'notifications.telegramUsers');
  if (tg.enabled && matches(tg.types)) {
    const users = await db.user.findMany({ where: { id: { in: ids }, isActive: true, telegramChatId: { not: null } }, select: { id: true } });
    for (const u of users) {
      const created = await db.notification.create({ data: row('TELEGRAM', u.id), select: { id: true } });
      await enqueueJob(db, {
        type: 'telegram.send',
        queue: 'telegram',
        payload: { notificationId: created.id },
        dedupeKey: `telegram.send:${created.id}`,
      });
      out.telegram++;
    }
  }
  return out;
}

/** Active holders of the role plus active delegates (delegation window, not revoked). */
export async function resolveRoleRecipients(db: Db, roleId: string, departmentId?: string | null): Promise<string[]> {
  const role = await db.role.findUnique({ where: { id: roleId } });
  if (!role || !role.isActive) return [];
  if (departmentId && role.scopeDepartmentId && role.scopeDepartmentId !== departmentId) return [];
  const holders = await db.userRole.findMany({
    where: { roleId, user: { isActive: true } },
    select: { userId: true },
  });
  const holderIds = holders.map((h) => h.userId);
  const now = new Date();
  const delegations = holderIds.length
    ? await db.delegation.findMany({
        where: {
          fromUserId: { in: holderIds },
          OR: [{ roleId: null }, { roleId }],
          revokedAt: null,
          startsAt: { lte: now },
          endsAt: { gt: now },
          toUser: { isActive: true },
        },
        select: { toUserId: true },
      })
    : [];
  return [...new Set([...holderIds, ...delegations.map((d) => d.toUserId)])];
}

export async function notifyRole(db: Db, n: NotifyBase & { roleId: string; departmentId?: string | null }): Promise<void> {
  const userIds = await resolveRoleRecipients(db, n.roleId, n.departmentId);
  const { roleId: _r, departmentId: _d, ...base } = n;
  await notifyUsers(db, { ...base, userIds });
}

/** TELEGRAM notification row + `telegram.send` job on the telegram queue (outbox). */
export async function notifySubmitter(
  db: Db,
  n: { submitterId: string; type: string; requestId?: string; bodyAr: string; data?: Record<string, unknown> },
): Promise<void> {
  if (!n.submitterId) throw new DomainError('VALIDATION', 'submitterId is required');
  const row = await db.notification.create({
    data: {
      channel: 'TELEGRAM',
      recipientSubmitterId: n.submitterId,
      type: n.type,
      requestId: n.requestId ?? null,
      bodyAr: n.bodyAr,
      data: toJsonValue(n.data),
      status: 'PENDING',
    },
    select: { id: true },
  });
  await enqueueJob(db, {
    type: 'telegram.send',
    queue: 'telegram',
    payload: { notificationId: row.id },
    dedupeKey: `telegram.send:${row.id}`,
  });
}
