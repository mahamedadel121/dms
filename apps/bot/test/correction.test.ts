import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { requestCorrection } from '@dms/core/engine';
import { loadAuthUser } from '@dms/core/rbac';
import { addLine, beginRequest, jpeg, linkDriver, setup, tail, type Env } from './helpers';

let env: Env;
beforeAll(async () => {
  env = await setup('wp3-corr');
});
afterAll(async () => {
  await env.db.teardown();
});

/** Submits a one-line request through the bot, then lets the active step's approver ask for a correction. */
async function submitAndAskCorrection(n: number, fixType: 'REUPLOAD' | 'AMOUNT' | 'BOTH') {
  const u = await linkDriver(env.h, n);
  await beginRequest(u);
  await addLine(u, 'رسوم طرق', '100');
  await u.click('كده خلصت');
  await u.click('تأكيد وإرسال');
  const number = /DE-\d{2}-\d{6}/.exec(u.lastText()!)![0];
  const req = await env.prisma.request.findFirstOrThrow({ where: { number }, include: { lines: true } });
  const step = await env.prisma.requestStepInstance.findFirstOrThrow({ where: { requestId: req.id, status: 'ACTIVE' } });
  const holder = await env.prisma.userRole.findFirstOrThrow({ where: { roleId: step.roleId } });
  const user = (await loadAuthUser(env.prisma, holder.userId))!;
  await requestCorrection(env.prisma, {
    requestId: req.id,
    stepInstanceId: step.id,
    user,
    items: [{ lineId: req.lines[0]!.id, reasonCode: fixType === 'AMOUNT' ? 'WRONG_AMOUNT' : 'IMAGE_UNCLEAR', fixType, comment: 'الصورة مش واضحة' }],
    actor: { type: 'USER', userId: user.id },
  });
  return { u, req, step, number };
}

describe('correction flow', () => {
  it('re-upload: notification with a button, old image superseded, the step returns to ACTIVE', async () => {
    const { u, req, step, number } = await submitAndAskCorrection(1, 'REUPLOAD');
    await env.h.flushTelegramJobs();
    expect(tail(u, 3)).toContain(number);
    const oldAtt = await env.prisma.attachment.findFirstOrThrow({ where: { requestId: req.id, isCurrent: true } });

    await u.text('القائمة');
    expect(JSON.stringify(u.sent().at(-1)!.reply)).toContain('تصحيح مطلوب (1)');
    await u.click('تصحيح مطلوب');
    expect(tail(u, 2)).toContain('الصورة مش واضحة');
    await u.text('هكتب كلام'); // text while a photo is expected
    expect(u.lastText()).toContain('صور');
    await u.click('خلصت وابعت'); // nothing uploaded yet
    expect(u.lastText()).toContain('على الأقل');
    await u.photo(await jpeg());
    await u.click('خلصت وابعت');
    expect(tail(u, 2)).toContain('اتبعت التصحيح');

    const after = await env.prisma.request.findUniqueOrThrow({ where: { id: req.id } });
    expect(after.status).toBe('IN_REVIEW');
    const st = await env.prisma.requestStepInstance.findUniqueOrThrow({ where: { id: step.id } });
    expect(st.status).toBe('ACTIVE');
    const old = await env.prisma.attachment.findUniqueOrThrow({ where: { id: oldAtt.id } });
    expect(old.isCurrent).toBe(false);
    expect(old.supersededById).not.toBeNull();
    const current = await env.prisma.attachment.findMany({ where: { requestId: req.id, isCurrent: true } });
    expect(current).toHaveLength(1);
    expect(current[0]!.id).not.toBe(oldAtt.id);
    const session = await env.prisma.botSession.findFirstOrThrow({ where: { telegramUserId: 5001n } });
    expect(session.state).toBe('IDLE');
    expect(session.correction).toBeNull();
  });

  it('amount correction via the notification button', async () => {
    const { u, req } = await submitAndAskCorrection(2, 'AMOUNT');
    await env.h.flushTelegramJobs();
    await u.click('صحّح دلوقتي');
    expect(u.lastText()).toContain('المبلغ الصحيح');
    await u.text('abc');
    expect(u.lastText()).toContain('أكبر من صفر');
    await u.text('١٢٠');
    expect(tail(u, 2)).toContain('اتبعت التصحيح');
    const line = await env.prisma.requestLine.findFirstOrThrow({ where: { requestId: req.id } });
    expect(Number(line.amount)).toBe(120);
    expect(Number(line.originalAmount)).toBe(100);
  });

  it('with no open corrections the driver is told so', async () => {
    const u = await linkDriver(env.h, 3);
    await u.text('تصحيح مطلوب');
    expect(u.lastText()).toContain('مفيش تصحيحات');
  });
});
