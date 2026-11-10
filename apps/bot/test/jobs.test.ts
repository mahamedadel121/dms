import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { enqueueJob } from '@dms/core/jobs';
import { phoneOf, setup, type Env } from './helpers';

let env: Env;
beforeAll(async () => {
  env = await setup('p2-bot-jobs');
});
afterAll(async () => {
  await env.db.teardown();
});

async function notify(data: Record<string, unknown>, who: { userId?: string; submitterId?: string }) {
  const n = await env.prisma.notification.create({
    data: {
      channel: 'TELEGRAM',
      recipientUserId: who.userId ?? null,
      recipientSubmitterId: who.submitterId ?? null,
      type: 'REQUEST_PENDING',
      titleAr: 'عنوان',
      bodyAr: 'نص الإشعار',
      data: data as never,
      status: 'PENDING',
    },
  });
  await enqueueJob(env.prisma, { type: 'telegram.send', queue: 'telegram', payload: { notificationId: n.id } });
  return n.id;
}

describe('telegram.send to users', () => {
  it('sends title, body and link to a linked user and marks SENT', async () => {
    const user = await env.prisma.user.create({
      data: { username: 'jb1', passwordHash: 'x', fullName: 'J One', telegramUserId: 7201n, telegramChatId: 7201n },
    });
    const id = await notify({ link: '/requests/abc' }, { userId: user.id });
    await env.h.flushTelegramJobs();
    const m = env.h.sent(7201).at(-1)!;
    expect(m.text).toMatch(/^عنوان\nنص الإشعار\nhttps?:\/\/.+\/requests\/abc$/);
    expect((await env.prisma.notification.findUniqueOrThrow({ where: { id } })).status).toBe('SENT');
  });

  it('skips a user without a chat id', async () => {
    const user = await env.prisma.user.create({ data: { username: 'jb2', passwordHash: 'x', fullName: 'J Two' } });
    const id = await notify({}, { userId: user.id });
    await env.h.flushTelegramJobs();
    const n = await env.prisma.notification.findUniqueOrThrow({ where: { id } });
    expect(n.status).toBe('SKIPPED');
    expect(n.error).toBe('no telegram chat id');
  });

  it('driver notifications keep the correction buttons', async () => {
    const sub = await env.prisma.submitter.findUniqueOrThrow({ where: { phone: phoneOf(22) } });
    await env.prisma.submitter.update({ where: { id: sub.id }, data: { telegramUserId: 7203n, telegramChatId: 7203n } });
    await notify({ correctionRequestIds: ['req1'] }, { submitterId: sub.id });
    await env.h.flushTelegramJobs();
    const m = env.h.sent(7203).at(-1)!;
    expect(m.text).toBe('نص الإشعار');
    expect(JSON.stringify(m.inline)).toContain('corr:req1');
  });
});
