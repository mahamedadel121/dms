import type { Job, PrismaClient } from '@prisma/client';
import { JOB_TYPES } from '@dms/shared';
import { DomainError } from '@dms/core/errors';
import type { JobHandler, JobSchedule } from '@dms/core/jobs';
import { finalizeRequestPdf } from '@dms/core/pdf';
import { runExport, expireExports } from '@dms/core/reports';
import { sendEmailNotification } from '@dms/core/email';
import { processSapPosting } from '@dms/core/sap';
import { runSlaScan, sweepBotDrafts } from '@dms/core/sla';
import { getStorage, type StorageAdapter } from '@dms/core/storage';

export interface WorkerDeps {
  storage?: () => StorageAdapter;
}

type Ctx = { prisma: PrismaClient };

/** Every handler is idempotent: stale-lock recovery may run a job twice. */
export function createHandlers(deps: WorkerDeps = {}): Record<string, JobHandler> {
  const storage = deps.storage ?? getStorage;
  return {
    [JOB_TYPES.SAP_POST]: async (job: Job, { prisma }: Ctx) => {
      const p = (job.payload ?? {}) as { postingId?: string; trigger?: 'AUTO' | 'MANUAL'; userId?: string; force?: boolean };
      if (!p.postingId) throw Object.assign(new DomainError('VALIDATION', 'sap.post needs postingId'), { fatal: true });
      const r = await processSapPosting(prisma, p.postingId, { trigger: p.trigger ?? 'AUTO', userId: p.userId, force: p.force === true });
      return { status: r.status, sapDocNumber: r.sapDocNumber };
    },
    [JOB_TYPES.PDF_FINALIZE]: async (job: Job, { prisma }: Ctx) => {
      const p = (job.payload ?? {}) as { requestId?: string };
      if (!p.requestId) throw Object.assign(new DomainError('VALIDATION', 'pdf.finalize needs requestId'), { fatal: true });
      const d = await finalizeRequestPdf(prisma, storage(), p.requestId);
      return { documentId: d.id, sha256: d.sha256 };
    },
    [JOB_TYPES.REPORT_EXPORT]: async (job: Job, { prisma }: Ctx) => {
      const p = (job.payload ?? {}) as { exportId?: string };
      if (!p.exportId) throw Object.assign(new DomainError('VALIDATION', 'report.export needs exportId'), { fatal: true });
      await runExport(prisma, storage(), p.exportId);
    },
    [JOB_TYPES.SLA_SCAN]: async (_job: Job, { prisma }: Ctx) => runSlaScan(prisma),
    [JOB_TYPES.BOT_DRAFT_SWEEP]: async (_job: Job, { prisma }: Ctx) => sweepBotDrafts(prisma, storage()),
    [JOB_TYPES.EXPORTS_SWEEP]: async (_job: Job, { prisma }: Ctx) => expireExports(prisma, storage()),
    [JOB_TYPES.EMAIL_SEND]: async (job: Job, { prisma }: Ctx) => {
      const p = (job.payload ?? {}) as { notificationId?: string };
      if (!p.notificationId) throw Object.assign(new DomainError('VALIDATION', 'email.send needs notificationId'), { fatal: true });
      return sendEmailNotification(prisma, p.notificationId);
    },
  };
}

export const SCHEDULES: JobSchedule[] = [
  { type: JOB_TYPES.SLA_SCAN, everySec: 5 * 60 },
  { type: JOB_TYPES.BOT_DRAFT_SWEEP, everySec: 15 * 60 },
  { type: JOB_TYPES.EXPORTS_SWEEP, everySec: 60 * 60 },
];
