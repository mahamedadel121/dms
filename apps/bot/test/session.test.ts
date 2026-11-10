import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadAuthUser } from '@dms/core/rbac';
import { decideVehicleChangeRequest } from '@dms/core/fleet';
import { notifySubmitter } from '@dms/core/notifications';
import { createBotHarness } from '../src/testing/harness';
import { addLine, beginRequest, jpeg, linkDriver, setup, tail, type Env } from './helpers';

let env: Env;
beforeAll(async () => {
  env = await setup('wp3-session');
});
afterAll(async () => {
  await env.db.teardown();
});

describe('drafts', () => {
  it('resumes the draft after a restart (new bot instance, same DB) and via the menu', async () => {
    const u = await linkDriver(env.h, 1);
    await beginRequest(u);
    await addLine(u, 'رسوم طرق', '40');
    await u.click('إضافة مصروف تاني');
    await u.click('صيانة');
    await u.text('900'); // now waiting for photos

    const h2 = createBotHarness({ prisma: env.prisma, storage: env.storage });
    const u2 = h2.user(5001);
    await u2.text('القائمة');
    await u2.text('طلب جديد');
    expect(u2.lastText()).toContain('لسه مخلصش');
    await u2.click('أكمل الطلب');
    expect(u2.lastText()).toContain('صور');
    await u2.photo(await jpeg());
    await u2.click('خلصت صور');
    await u2.click('كده خلصت');
    expect(u2.lastText()).toContain('940.00');
    // the draft survived in bot_sessions with an expiry
    const s = await env.prisma.botSession.findFirstOrThrow({ where: { telegramUserId: 5001n } });
    expect(s.draftExpiresAt).not.toBeNull();
    // discard starts over
    await u2.text('طلب جديد');
    await u2.click('امسح وابدأ من جديد');
    expect(u2.lastText()).toContain('2157');
  });

  it('an expired draft is dropped', async () => {
    const u = await linkDriver(env.h, 2);
    await beginRequest(u);
    await u.click('صيانة');
    env.h.setNow(new Date(Date.now() + 25 * 3600_000));
    await u.text('500');
    env.h.setNow(null);
    expect(tail(u, 3)).toContain('انتهت مدته');
    const s = await env.prisma.botSession.findFirstOrThrow({ where: { telegramUserId: 5002n } });
    expect(s.draft).toBeNull();
  });

  it('redelivered updates (update_id <= lastUpdateId) are dropped', async () => {
    const u = env.h.user(5002);
    const before = u.sent().length;
    const s = await env.prisma.botSession.findFirstOrThrow({ where: { telegramUserId: 5002n } });
    await env.h.bot.handleUpdate({
      update_id: s.lastUpdateId!,
      message: { message_id: 1, date: 0, chat: { id: 5002, type: 'private' }, from: { id: 5002, is_bot: false, first_name: 'x' }, text: 'القائمة' },
    } as never);
    expect(u.sent().length).toBe(before);
  });
});

describe('my requests, vehicle change, rate limit', () => {
  it('my requests lists submitted requests with number and status', async () => {
    const u = await linkDriver(env.h, 3);
    await u.click('طلباتي');
    expect(u.lastText()).toContain('لسه معندكش');
    await beginRequest(u);
    await addLine(u, 'إكراميات', '25');
    await u.click('كده خلصت');
    await u.click('تأكيد وإرسال');
    const num = /DE-\d{2}-\d{6}/.exec(u.lastText()!)![0];
    await u.click('طلباتي');
    expect(u.lastText()).toContain(num);
    expect(u.lastText()).toContain('تحت المراجعة');
  });

  it('vehicle change request is created, blocks new requests, and the decision notifies the driver', async () => {
    const u = await linkDriver(env.h, 4);
    await u.click('طلب جديد');
    await u.click('لأ');
    expect(u.lastText()).toContain('رقم العربية');
    const other = await env.prisma.vehicle.findFirstOrThrow({ where: { number: { not: '2160' }, status: 'ACTIVE' }, orderBy: { number: 'desc' } });
    await u.text(other.number);
    const vcr = await env.prisma.vehicleChangeRequest.findFirstOrThrow({ where: { submitter: { code: 'DRV004' } } });
    expect(vcr.status).toBe('PENDING');
    expect(vcr.toVehicleId).toBe(other.id);
    await u.text('طلب جديد');
    expect(u.lastText()).toContain('مسؤول الشحن');

    const shipping = await env.prisma.user.findFirstOrThrow({ where: { username: 'shipping' } });
    const user = (await loadAuthUser(env.prisma, shipping.id))!;
    await decideVehicleChangeRequest(env.prisma, {
      id: vcr.id,
      approve: true,
      user,
      actor: { type: 'USER', userId: shipping.id },
    });
    expect(await env.h.flushTelegramJobs()).toBeGreaterThan(0);
    expect(u.lastText()).toContain('الموافقة');
    await u.click('طلب جديد');
    expect(u.lastText()).toContain(other.number);
  });

  it('an unknown typed vehicle number still creates a request for the Shipping Officer', async () => {
    const u = await linkDriver(env.h, 5);
    await u.click('طلب جديد');
    await u.click('لأ');
    await u.text('٩٩٩٩٩');
    const vcr = await env.prisma.vehicleChangeRequest.findFirstOrThrow({ where: { submitter: { code: 'DRV005' } } });
    expect(vcr.toVehicleId).toBeNull();
    expect(vcr.requestedVehicleText).toBe('99999');
  });

  it('rate limiting drops excess updates and warns once', async () => {
    const e2 = await setup('wp3-rate', { rateLimit: { capacity: 5, windowMs: 10_000 }, now: () => new Date('2026-01-01T10:00:00Z') });
    try {
      const u = e2.h.user(7777);
      for (let i = 0; i < 9; i++) await u.text('hello');
      const texts = u.sent().map((m) => m.text);
      expect(texts.filter((t) => t.includes('براحة')).length).toBe(1);
      expect(texts.length).toBe(6); // 5 handled + 1 warning
    } finally {
      await e2.db.teardown();
    }
  });
});

describe('telegram.send job', () => {
  it('sends to linked drivers, skips drivers without a chat, marks blocked chats as failed', async () => {
    const u = await linkDriver(env.h, 6);
    const linked = await env.prisma.submitter.findUniqueOrThrow({ where: { code: 'DRV006' } });
    const unlinked = await env.prisma.submitter.findUniqueOrThrow({ where: { code: 'DRV010' } });
    await notifySubmitter(env.prisma, { submitterId: linked.id, type: 'REQ_PAID', bodyAr: 'تم صرف طلبك' });
    await notifySubmitter(env.prisma, { submitterId: unlinked.id, type: 'REQ_PAID', bodyAr: 'تم صرف طلبك' });
    await env.h.flushTelegramJobs();
    expect(u.lastText()).toBe('تم صرف طلبك');
    const rows = await env.prisma.notification.findMany({ where: { type: 'REQ_PAID' } });
    expect(rows.find((r) => r.recipientSubmitterId === linked.id)?.status).toBe('SENT');
    expect(rows.find((r) => r.recipientSubmitterId === unlinked.id)?.status).toBe('SKIPPED');

    await notifySubmitter(env.prisma, { submitterId: linked.id, type: 'REQ_PAID', bodyAr: 'تاني' });
    env.h.failSends({ code: 403, description: 'Forbidden: bot was blocked by the user' });
    await env.h.flushTelegramJobs();
    env.h.failSends(null);
    const failed = await env.prisma.notification.findFirst({ where: { bodyAr: 'تاني' } });
    expect(failed?.status).toBe('FAILED');
  });
});
