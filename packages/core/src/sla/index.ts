import type { PrismaClient } from '@prisma/client';
import { getSetting } from '../config';
import { notifyRole } from '../notifications';
import { sweepBotDrafts, sweepExports } from './sweeps';

export { sweepBotDrafts, sweepExports };

/**
 * Job sla.scan (every 5 min): ACTIVE step instances past `dueAt` whose last reminder is older than
 * `workflow.slaReminderIntervalHours` (or never sent) notify the role holders (and delegates) and bump
 * `lastReminderAt` / `reminderCount`. The bump is a conditional UPDATE, so two scans never remind twice.
 */
export async function runSlaScan(prisma: PrismaClient, now = new Date()): Promise<{ reminded: number }> {
  const intervalH = await getSetting(prisma, 'workflow.slaReminderIntervalHours');
  const cutoff = new Date(now.getTime() - intervalH * 3_600_000);
  const dueWhere = {
    status: 'ACTIVE' as const,
    dueAt: { lt: now },
    OR: [{ lastReminderAt: null }, { lastReminderAt: { lt: cutoff } }],
  };
  const rows = await prisma.requestStepInstance.findMany({
    where: dueWhere,
    include: { request: { select: { id: true, number: true, departmentId: true } } },
    orderBy: { dueAt: 'asc' },
    take: 500,
  });
  let reminded = 0;
  for (const si of rows) {
    const done = await prisma.$transaction(async (tx) => {
      const claim = await tx.requestStepInstance.updateMany({
        where: { id: si.id, ...dueWhere },
        data: { lastReminderAt: now, reminderCount: { increment: 1 } },
      });
      if (claim.count !== 1) return false;
      const hours = Math.max(1, Math.round((now.getTime() - si.dueAt!.getTime()) / 3_600_000));
      await notifyRole(tx, {
        roleId: si.roleId,
        departmentId: si.request.departmentId,
        type: 'SLA_REMINDER',
        requestId: si.request.id,
        titleAr: `تأخير في الطلب ${si.request.number}`,
        titleEn: `Request ${si.request.number} is overdue`,
        bodyAr: `الطلب ${si.request.number} متأخر في خطوة "${si.nameAr}" منذ ${hours} ساعة.`,
        bodyEn: `Request ${si.request.number} has been overdue at "${si.nameEn}" for ${hours} h.`,
        data: { stepInstanceId: si.id, requestNumber: si.request.number, link: `/requests/${si.request.id}` },
      });
      return true;
    });
    if (done) reminded++;
  }
  return { reminded };
}
