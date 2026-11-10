import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createLinkToken } from '@dms/core/telegram';
import { M } from '../src/messages';
import { phoneOf, setup, type Env } from './helpers';

let env: Env;
let seq = 0;
beforeAll(async () => {
  env = await setup('p2-bot-link');
});
afterAll(async () => {
  await env.db.teardown();
});

async function mkUser(telegramUserId?: bigint) {
  seq += 1;
  return env.prisma.user.create({
    data: {
      username: `lnk${seq}`,
      passwordHash: 'x',
      fullName: `Approver ${seq}`,
      telegramUserId: telegramUserId ?? null,
      telegramChatId: telegramUserId ?? null,
    },
  });
}
const driverId = async (n: number) => (await env.prisma.submitter.findUniqueOrThrow({ where: { phone: phoneOf(n) } })).id;
const userToken = (id: string, o: { ttlSec?: number; now?: Date } = {}) => createLinkToken({ kind: 'u', id, ...o }).token;

describe('admin-issued link tokens', () => {
  it('a user token links the approver', async () => {
    const user = await mkUser();
    const u = env.h.user(7101);
    await u.text('/start ' + userToken(user.id));
    expect(u.lastText()).toBe(M.userLinked(user.fullName));
    const row = await env.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.telegramUserId).toBe(7101n);
    expect(row.telegramChatId).toBe(7101n);
    const a = await env.prisma.auditLog.findFirst({ where: { action: 'user.telegram_link', entityId: user.id } });
    expect(a).not.toBeNull();
  });

  it('an expired token is refused', async () => {
    const user = await mkUser();
    const u = env.h.user(7102);
    await u.text('/start ' + userToken(user.id, { ttlSec: 60, now: new Date(Date.now() - 3600_000) }));
    expect(u.lastText()).toBe(M.linkInvalid);
    expect((await env.prisma.user.findUniqueOrThrow({ where: { id: user.id } })).telegramUserId).toBeNull();
  });

  it('a tampered token is refused', async () => {
    const user = await mkUser();
    const t = userToken(user.id);
    const bad = t.slice(0, -1) + (t.endsWith('a') ? 'b' : 'a');
    const u = env.h.user(7103);
    await u.text('/start ' + bad);
    expect(u.lastText()).toBe(M.linkInvalid);
    expect((await env.prisma.user.findUniqueOrThrow({ where: { id: user.id } })).telegramUserId).toBeNull();
  });

  it('refuses when the user is linked to another Telegram account', async () => {
    const user = await mkUser(7190n);
    const u = env.h.user(7104);
    await u.text('/start ' + userToken(user.id));
    expect(u.lastText()).toBe(M.linkTaken);
    expect((await env.prisma.user.findUniqueOrThrow({ where: { id: user.id } })).telegramUserId).toBe(7190n);
  });

  it('refuses when the Telegram account belongs to another user', async () => {
    await mkUser(7105n);
    const user = await mkUser();
    const u = env.h.user(7105);
    await u.text('/start ' + userToken(user.id));
    expect(u.lastText()).toBe(M.linkTaken);
    expect((await env.prisma.user.findUniqueOrThrow({ where: { id: user.id } })).telegramUserId).toBeNull();
  });

  it('a driver token links the driver and shows the menu', async () => {
    const id = await driverId(20);
    const u = env.h.user(7106);
    await u.text('/start ' + createLinkToken({ kind: 'd', id }).token);
    expect(u.lastText()).toContain('تم ربط حسابك');
    expect(JSON.stringify(u.replyKeyboard())).toContain('طلب جديد');
    const sub = await env.prisma.submitter.findUniqueOrThrow({ where: { id } });
    expect(sub.telegramUserId).toBe(7106n);
    const s = await env.prisma.botSession.findUniqueOrThrow({ where: { telegramUserId: 7106n } });
    expect(s.state).toBe('IDLE');
    const a = await env.prisma.auditLog.findFirstOrThrow({ where: { action: 'bot.linked', entityId: id } });
    expect((a.meta as { via?: string }).via).toBe('admin_link');
  });

  it('a driver token is refused when the driver is linked elsewhere', async () => {
    const id = await driverId(21);
    await env.prisma.submitter.update({ where: { id }, data: { telegramUserId: 7191n } });
    const u = env.h.user(7107);
    await u.text('/start ' + createLinkToken({ kind: 'd', id }).token);
    expect(u.lastText()).toBe(M.alreadyLinked);
  });

  it('a linked approver gets the approver-only message', async () => {
    await mkUser(7108n);
    const u = env.h.user(7108);
    await u.text('hello');
    expect(u.lastText()).toBe(M.approverOnly);
    await u.start();
    expect(u.lastText()).toBe(M.approverOnly);
  });

  it('plain /start still shows the welcome with the contact button', async () => {
    const u = env.h.user(7109);
    await u.start();
    expect(u.lastText()).toBe(M.welcome);
    expect(JSON.stringify(u.sent().at(-1)!.reply)).toContain('"contact":true');
  });
});
