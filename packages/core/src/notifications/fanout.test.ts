import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { setupTestDb } from '@dms/db/testing';
import { Prisma, type PrismaClient } from '@prisma/client';
import { resetConfigCache } from '../config';
import { notifyUsers } from './index';

let prisma: PrismaClient;
let teardown: () => Promise<void>;
const savedDriver = process.env.EMAIL_DRIVER;

beforeAll(async () => {
  const t = await setupTestDb('p2-fanout');
  prisma = t.prisma;
  teardown = t.teardown;
});
afterAll(async () => {
  restoreEnv();
  await teardown?.();
});
afterEach(async () => {
  restoreEnv();
  await prisma.setting.deleteMany({ where: { key: { in: ['notifications.email', 'notifications.telegramUsers'] } } });
});

function restoreEnv() {
  if (savedDriver === undefined) delete process.env.EMAIL_DRIVER;
  else process.env.EMAIL_DRIVER = savedDriver;
  resetConfigCache();
}

function setDriver(v: string) {
  process.env.EMAIL_DRIVER = v;
  resetConfigCache();
}

async function setSettingRow(key: string, value: Prisma.InputJsonValue | typeof Prisma.JsonNull) {
  await prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
}

let seq = 0;
async function makeUser(o: { email?: string | null; telegramChatId?: bigint | null } = {}) {
  seq++;
  return prisma.user.create({
    data: {
      username: `p2fan${seq}_${Date.now()}`,
      passwordHash: 'x',
      fullName: 'Fan Out',
      email: o.email === undefined ? `fan${seq}@example.test` : o.email,
      telegramChatId: o.telegramChatId ?? null,
    },
  });
}

const base = { type: 'REQ_AT_STEP', titleAr: 'عنوان', titleEn: 'Title', bodyAr: 'نص', bodyEn: 'Body', data: { link: '/requests/x', requestNumber: 'R-1' } };

describe('notifyUsers fan-out', () => {
  it('creates only in-app rows by default', async () => {
    const u = await makeUser({ telegramChatId: 111n });
    await notifyUsers(prisma, { ...base, userIds: [u.id] });
    const rows = await prisma.notification.findMany({ where: { recipientUserId: u.id } });
    expect(rows.map((r) => r.channel)).toEqual(['IN_APP']);
    expect(await prisma.job.count({ where: { type: { in: ['email.send', 'telegram.send'] } } })).toBe(0);
  });

  it('creates EMAIL rows and email.send jobs for users with an address', async () => {
    setDriver('file');
    await setSettingRow('notifications.email', { enabled: true, types: ['REQ_AT_STEP'] });
    const withMail = await makeUser();
    const noMail = await makeUser({ email: null });
    await notifyUsers(prisma, { ...base, userIds: [withMail.id, noMail.id] });
    const emails = await prisma.notification.findMany({ where: { channel: 'EMAIL', recipientUserId: { in: [withMail.id, noMail.id] } } });
    expect(emails).toHaveLength(1);
    expect(emails[0]!.recipientUserId).toBe(withMail.id);
    expect(emails[0]!.status).toBe('PENDING');
    const job = await prisma.job.findUniqueOrThrow({ where: { dedupeKey: `email.send:${emails[0]!.id}` } });
    expect(job.type).toBe('email.send');
    expect(job.queue).toBe('default');
    expect(job.payload).toEqual({ notificationId: emails[0]!.id });
    // the in-app rows are still created for both users
    expect(await prisma.notification.count({ where: { channel: 'IN_APP', recipientUserId: { in: [withMail.id, noMail.id] } } })).toBe(2);
  });

  it('skips types that are not listed', async () => {
    setDriver('file');
    await setSettingRow('notifications.email', { enabled: true, types: ['SLA_REMINDER'] });
    const u = await makeUser();
    await notifyUsers(prisma, { ...base, userIds: [u.id] });
    expect(await prisma.notification.count({ where: { channel: 'EMAIL', recipientUserId: u.id } })).toBe(0);
  });

  it("'*' matches every type", async () => {
    setDriver('file');
    await setSettingRow('notifications.email', { enabled: true, types: ['*'] });
    const u = await makeUser();
    await notifyUsers(prisma, { ...base, type: 'SOMETHING_ELSE', userIds: [u.id] });
    expect(await prisma.notification.count({ where: { channel: 'EMAIL', recipientUserId: u.id } })).toBe(1);
  });

  it('creates TELEGRAM rows for linked users on the telegram queue', async () => {
    await setSettingRow('notifications.telegramUsers', { enabled: true, types: ['REQ_AT_STEP'] });
    const linked = await makeUser({ telegramChatId: 555n });
    const unlinked = await makeUser();
    await notifyUsers(prisma, { ...base, userIds: [linked.id, unlinked.id] });
    const rows = await prisma.notification.findMany({ where: { channel: 'TELEGRAM', recipientUserId: { in: [linked.id, unlinked.id] } } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.recipientUserId).toBe(linked.id);
    const job = await prisma.job.findUniqueOrThrow({ where: { dedupeKey: `telegram.send:${rows[0]!.id}` } });
    expect(job.queue).toBe('telegram');
    expect(job.type).toBe('telegram.send');
  });

  it('a fan-out failure does not fail notifyUsers', async () => {
    setDriver('file');
    await setSettingRow('notifications.email', Prisma.JsonNull);
    const u = await makeUser();
    await expect(notifyUsers(prisma, { ...base, userIds: [u.id] })).resolves.toBeUndefined();
    expect(await prisma.notification.count({ where: { channel: 'IN_APP', recipientUserId: u.id } })).toBe(1);
  });

  it('works inside a transaction', async () => {
    setDriver('file');
    await setSettingRow('notifications.email', { enabled: true, types: ['*'] });
    const u = await makeUser();
    await prisma.$transaction(async (tx) => {
      await notifyUsers(tx, { ...base, userIds: [u.id] });
    });
    expect(await prisma.notification.count({ where: { recipientUserId: u.id, channel: 'EMAIL' } })).toBe(1);
    expect(await prisma.job.count({ where: { type: 'email.send', payload: { path: ['notificationId'], not: Prisma.AnyNull } } })).toBeGreaterThan(0);
  });
});
