import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { phoneOf, setup, type Env } from './helpers';

let env: Env;
beforeAll(async () => {
  env = await setup('wp3-onboard');
});
afterAll(async () => {
  await env.db.teardown();
});

describe('onboarding', () => {
  it('/start asks for the contact with a request_contact button', async () => {
    const u = env.h.user(6001);
    await u.start();
    const m = u.sent().at(-1)!;
    expect(m.reply).not.toBe('remove');
    expect(JSON.stringify(m.reply)).toContain('"contact":true');
  });

  it('typed phone number is refused', async () => {
    const u = env.h.user(6002);
    await u.start();
    await u.text('01000000001');
    expect(u.lastText()).toContain('شارك رقم تليفوني');
    const s = await env.prisma.submitter.findUnique({ where: { phone: phoneOf(1) } });
    expect(s?.telegramUserId).toBeNull();
  });

  it('foreign contact (user_id != from.id) is refused and audited', async () => {
    const u = env.h.user(6003);
    await u.start();
    await u.contact({ phone: phoneOf(2), userId: 999999 });
    expect(u.lastText()).toContain('مش رقم حسابك');
    const s = await env.prisma.submitter.findUnique({ where: { phone: phoneOf(2) } });
    expect(s?.telegramUserId).toBeNull();
    const a = await env.prisma.auditLog.findFirst({ where: { action: 'bot.contact_mismatch' } });
    expect(a).not.toBeNull();
  });

  it('unknown phone -> contact the supervisor', async () => {
    const u = env.h.user(6004);
    await u.start();
    await u.contact({ phone: '+201199999999' });
    expect(u.lastText()).toContain('المشرف');
  });

  it('own contact with a different Egyptian format links the driver permanently', async () => {
    const u = env.h.user(6005);
    await u.start();
    await u.contact({ phone: '0020' + phoneOf(3).slice(3) });
    expect(u.lastText()).toContain('تم ربط حسابك');
    const s = await env.prisma.submitter.findUnique({ where: { phone: phoneOf(3) } });
    expect(s?.telegramUserId).toBe(6005n);
    // second telegram account cannot take the same driver
    const v = env.h.user(6006);
    await v.start();
    await v.contact({ phone: phoneOf(3) });
    expect(v.lastText()).toContain('مربوط بحساب');
    // menu has the main buttons
    await u.text('القائمة');
    expect(JSON.stringify(u.sent().at(-1)!.reply)).toContain('طلب جديد');
  });

  it('unlinking by the super user sends the driver back to onboarding', async () => {
    const u = env.h.user(6007);
    await u.start();
    await u.contact({ phone: phoneOf(4) });
    await env.prisma.submitter.update({ where: { phone: phoneOf(4) }, data: { telegramUserId: null, telegramChatId: null } });
    await u.text('طلب جديد');
    expect(u.lastText()).toContain('اتفك');
    await u.start();
    await u.contact({ phone: phoneOf(4) });
    expect(u.lastText()).toContain('تم ربط حسابك');
  });
});
