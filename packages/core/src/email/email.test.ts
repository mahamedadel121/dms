import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupTestDb } from '@dms/db/testing';
import type { PrismaClient } from '@prisma/client';
import { createLocalStorage } from '../storage';
import { createFileTransport, isPermanentEmailError, renderEmail, sendEmailNotification, type EmailMessage, type EmailTransport } from './index';

let prisma: PrismaClient;
let teardown: () => Promise<void>;
beforeAll(async () => {
  const t = await setupTestDb('p2-email');
  prisma = t.prisma;
  teardown = t.teardown;
});
afterAll(async () => {
  await teardown?.();
});

const view = {
  type: 'REQ_AT_STEP',
  titleAr: 'طلب جديد',
  titleEn: 'New request',
  bodyAr: 'سطر أول\nسطر ثان',
  bodyEn: 'Line one\nLine two',
  link: '/requests/abc',
  requestNumber: 'REQ-2026-0001',
};

class FakeTransport implements EmailTransport {
  name = 'fake';
  sent: EmailMessage[] = [];
  constructor(private err?: unknown) {}
  async send(msg: EmailMessage) {
    if (this.err) throw this.err;
    this.sent.push(msg);
    return { messageId: 'm' + this.sent.length };
  }
}

let seq = 0;
async function makeNotification(o: { email?: string | null; isActive?: boolean; locale?: string; channel?: 'EMAIL' | 'IN_APP' } = {}) {
  seq++;
  const user = await prisma.user.create({
    data: {
      username: `p2email${seq}_${Date.now()}`,
      passwordHash: 'x',
      fullName: 'Email Tester',
      email: o.email === undefined ? `u${seq}@example.test` : o.email,
      isActive: o.isActive ?? true,
      locale: o.locale ?? 'ar',
    },
  });
  const n = await prisma.notification.create({
    data: {
      channel: o.channel ?? 'EMAIL',
      recipientUserId: user.id,
      type: 'REQ_AT_STEP',
      titleAr: view.titleAr,
      titleEn: view.titleEn,
      bodyAr: view.bodyAr,
      bodyEn: view.bodyEn,
      data: { link: view.link, requestNumber: view.requestNumber },
      status: 'PENDING',
    },
  });
  return { user, n };
}

describe('renderEmail', () => {
  it('renders an Arabic RTL message with the request number in the subject', () => {
    const r = renderEmail(view, { locale: 'ar', webUrl: 'https://dms.example.test' });
    expect(r.subject).toBe('[REQ-2026-0001] طلب جديد');
    expect(r.html).toContain('dir="rtl" lang="ar"');
    expect(r.html).toContain('#14284B');
    expect(r.html).toContain('#C9A45C');
    expect(r.html).toContain('فتح الطلب');
    expect(r.html).toContain('href="https://dms.example.test/requests/abc"');
    expect(r.html).toContain('سطر أول<br>سطر ثان');
  });

  it('renders English LTR', () => {
    const r = renderEmail(view, { locale: 'en', webUrl: 'https://dms.example.test' });
    expect(r.subject).toBe('[REQ-2026-0001] New request');
    expect(r.html).toContain('dir="ltr" lang="en"');
    expect(r.html).toContain('Open request');
    expect(r.html).toContain('Line one<br>Line two');
    expect(r.html).toContain('Automated message from DMS; do not reply.');
  });

  it('escapes HTML in title and body', () => {
    const r = renderEmail(
      { ...view, titleEn: '<script>alert(1)</script>', bodyEn: 'a & <b>bold</b>' },
      { locale: 'en', webUrl: 'https://dms.example.test' },
    );
    expect(r.html).not.toContain('<script>');
    expect(r.html).not.toContain('<b>bold</b>');
    expect(r.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(r.html).toContain('a &amp; &lt;b&gt;bold&lt;/b&gt;');
  });

  it('omits the button without a link', () => {
    const r = renderEmail({ ...view, link: null }, { locale: 'en', webUrl: 'https://dms.example.test' });
    expect(r.html).not.toContain('Open request');
    expect(r.text).not.toContain('https://');
  });

  it('builds the text part', () => {
    const r = renderEmail(view, { locale: 'en', webUrl: 'https://dms.example.test' });
    expect(r.text).toBe('New request\n\nLine one\nLine two\n\nhttps://dms.example.test/requests/abc');
  });
});

describe('transport helpers', () => {
  it('classifies permanent SMTP errors', () => {
    expect(isPermanentEmailError({ responseCode: 550 })).toBe(true);
    expect(isPermanentEmailError({ code: 'EENVELOPE' })).toBe(true);
    expect(isPermanentEmailError({ code: 'EAUTH' })).toBe(true);
    expect(isPermanentEmailError({ code: 'ETIMEDOUT' })).toBe(false);
    expect(isPermanentEmailError({ responseCode: 421 })).toBe(false);
  });

  it('file transport writes a JSON message', async () => {
    const root = mkdtempSync(join(tmpdir(), 'dms-email-'));
    const storage = createLocalStorage(root);
    const t = createFileTransport(storage, 'DMS <no-reply@localhost>');
    const { messageId } = await t.send({ to: 'a@example.test', subject: 'S', html: '<p>h</p>', text: 't' });
    expect(messageId).toMatch(/^outbox-email\/\d{4}-\d{2}-\d{2}\/[0-9a-f]+\.json$/);
    const saved = JSON.parse(readFileSync(join(root, ...messageId.split('/')), 'utf8'));
    expect(saved).toMatchObject({ from: 'DMS <no-reply@localhost>', to: 'a@example.test', subject: 'S', html: '<p>h</p>', text: 't' });
    expect(typeof saved.at).toBe('string');
  });
});

describe('sendEmailNotification', () => {
  it('sends and marks SENT', async () => {
    const { n, user } = await makeNotification();
    const tx = new FakeTransport();
    expect(await sendEmailNotification(prisma, n.id, tx)).toEqual({ sent: true });
    expect(tx.sent).toHaveLength(1);
    expect(tx.sent[0]!.to).toBe(user.email);
    expect(tx.sent[0]!.subject).toBe('[REQ-2026-0001] طلب جديد');
    const row = await prisma.notification.findUniqueOrThrow({ where: { id: n.id } });
    expect(row.status).toBe('SENT');
    expect(row.sentAt).not.toBeNull();
  });

  it('is idempotent', async () => {
    const { n } = await makeNotification();
    const tx = new FakeTransport();
    await sendEmailNotification(prisma, n.id, tx);
    const again = await sendEmailNotification(prisma, n.id, tx);
    expect(again.sent).toBeUndefined();
    expect(again.skipped).toBeTruthy();
    expect(tx.sent).toHaveLength(1);
  });

  it('skips a user without e-mail', async () => {
    const { n } = await makeNotification({ email: null });
    const tx = new FakeTransport();
    expect(await sendEmailNotification(prisma, n.id, tx)).toEqual({ skipped: 'no email' });
    const row = await prisma.notification.findUniqueOrThrow({ where: { id: n.id } });
    expect(row.status).toBe('SKIPPED');
    expect(tx.sent).toHaveLength(0);
  });

  it('skips an inactive user', async () => {
    const { n } = await makeNotification({ isActive: false });
    const tx = new FakeTransport();
    expect((await sendEmailNotification(prisma, n.id, tx)).skipped).toBe('no email');
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: n.id } })).status).toBe('SKIPPED');
    expect(tx.sent).toHaveLength(0);
  });

  it('skips when e-mail is disabled', async () => {
    const { n } = await makeNotification();
    expect(await sendEmailNotification(prisma, n.id, null)).toEqual({ skipped: 'email disabled' });
    const row = await prisma.notification.findUniqueOrThrow({ where: { id: n.id } });
    expect(row.status).toBe('SKIPPED');
    expect(row.error).toBe('email disabled');
  });

  it('a permanent error marks FAILED and does not throw', async () => {
    const { n } = await makeNotification();
    const tx = new FakeTransport(Object.assign(new Error('550 mailbox unavailable'), { responseCode: 550 }));
    const r = await sendEmailNotification(prisma, n.id, tx);
    expect(r.failed).toContain('550');
    const row = await prisma.notification.findUniqueOrThrow({ where: { id: n.id } });
    expect(row.status).toBe('FAILED');
    expect(row.error).toContain('550');
  });

  it('a transient error rethrows and leaves PENDING', async () => {
    const { n } = await makeNotification();
    const tx = new FakeTransport(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }));
    await expect(sendEmailNotification(prisma, n.id, tx)).rejects.toThrow('timeout');
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: n.id } })).status).toBe('PENDING');
  });
});
