import type { PrismaClient } from '@prisma/client';
import { getConfig } from '../config';
import { getEmailTransport, isPermanentEmailError, type EmailTransport } from './transport';
import { renderEmail } from './templates';

export * from './transport';
export * from './templates';

function dataField(data: unknown, key: string): string | null {
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const v = (data as Record<string, unknown>)[key];
    if (typeof v === 'string' && v) return v;
  }
  return null;
}

export async function sendEmailNotification(
  prisma: PrismaClient,
  notificationId: string,
  transport?: EmailTransport | null,
): Promise<{ sent?: true; skipped?: string; failed?: string }> {
  const n = await prisma.notification.findUnique({ where: { id: notificationId }, include: { recipientUser: true } });
  if (!n) return { skipped: 'not found' };
  if (n.channel !== 'EMAIL') return { skipped: 'not email' };
  if (n.status === 'SENT' || n.status === 'SKIPPED') return { skipped: `already ${n.status.toLowerCase()}` };

  const skip = async (reason: string) => {
    await prisma.notification.update({ where: { id: n.id }, data: { status: 'SKIPPED', error: reason } });
    return { skipped: reason };
  };

  const tx = transport === undefined ? getEmailTransport() : transport;
  if (!tx) return skip('email disabled');
  const user = n.recipientUser;
  if (!user || !user.isActive || !user.email || !user.email.trim()) return skip('no email');

  const msg = renderEmail(
    {
      type: n.type,
      titleAr: n.titleAr,
      titleEn: n.titleEn,
      bodyAr: n.bodyAr,
      bodyEn: n.bodyEn,
      link: dataField(n.data, 'link'),
      requestNumber: dataField(n.data, 'requestNumber'),
    },
    { locale: user.locale === 'en' ? 'en' : 'ar', webUrl: getConfig().WEB_PUBLIC_URL },
  );
  try {
    await tx.send({ to: user.email.trim(), ...msg });
  } catch (e) {
    if (isPermanentEmailError(e)) {
      const message = e instanceof Error ? e.message : String(e);
      await prisma.notification.update({ where: { id: n.id }, data: { status: 'FAILED', error: message.slice(0, 500) } });
      return { failed: message };
    }
    throw e;
  }
  await prisma.notification.update({ where: { id: n.id }, data: { status: 'SENT', sentAt: new Date(), error: null } });
  return { sent: true };
}
