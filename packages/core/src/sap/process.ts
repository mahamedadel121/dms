import type { Prisma, PrismaClient, SapPosting } from '@prisma/client';
import { DomainError } from '../errors';
import { enqueueJob } from '../jobs';
import { getAdapterByName } from './adapters';
import type { JournalEntryDoc } from './types';

export const MAX_AUTO_ATTEMPTS = 8;

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 2000);

/**
 * Idempotent SAP posting (PLAN 7.3). Never posts twice: a POSTED row is a no-op, and when an earlier attempt's
 * outcome is unknown the adapter is asked for the reference first. A failure keeps the request PAID.
 */
export async function processSapPosting(
  prisma: PrismaClient,
  postingId: string,
  o?: { trigger?: 'AUTO' | 'MANUAL'; userId?: string },
): Promise<SapPosting> {
  const trigger = o?.trigger ?? 'AUTO';

  // 1. lock + mark POSTING + attempt row
  const start = await prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM sap_postings WHERE id = ${postingId} FOR UPDATE`;
    if (!locked.length) throw new DomainError('NOT_FOUND', 'SAP posting not found');
    const p = await tx.sapPosting.findUniqueOrThrow({ where: { id: postingId } });
    if (p.status === 'POSTED') return { done: p } as const;
    const attemptNo = p.attempts + 1;
    await tx.sapPosting.update({
      where: { id: postingId },
      data: { status: 'POSTING', attempts: attemptNo, nextRetryAt: null },
    });
    const attempt = await tx.sapPostingAttempt.create({
      data: { postingId, attemptNo, trigger, triggeredById: o?.userId ?? null },
    });
    return { posting: p, attemptId: attempt.id, unknownOutcome: p.status === 'POSTING' || p.attempts > 0 } as const;
  });
  if ('done' in start && start.done) return start.done;
  const { posting, attemptId, unknownOutcome } = start as Exclude<typeof start, { done: SapPosting }>;

  const doc = posting.payload as unknown as JournalEntryDoc;
  try {
    const adapter = getAdapterByName(posting.adapter);
    // 2. earlier attempt may have been accepted without us seeing the answer
    let result: { documentNumber: string; fiscalYear: string; companyCode?: string; raw?: unknown } | null = null;
    let reused = false;
    if (unknownOutcome) {
      const found = await adapter.findByReference(doc.reference, doc.companyCode);
      if (found) {
        result = { ...found, companyCode: doc.companyCode };
        reused = true;
      }
    }
    // 3. post
    if (!result) result = await adapter.post(doc);
    const raw = (result.raw ?? null) as { exportFileKey?: string } | null;

    // 4. commit the outcome
    return await prisma.$transaction(async (tx) => {
      const now = new Date();
      const updated = await tx.sapPosting.update({
        where: { id: postingId },
        data: {
          status: 'POSTED',
          sapDocNumber: result!.documentNumber,
          sapFiscalYear: result!.fiscalYear,
          sapCompanyCode: result!.companyCode ?? doc.companyCode,
          postedAt: now,
          lastError: null,
          nextRetryAt: null,
          ...(raw?.exportFileKey ? { exportFileKey: raw.exportFileKey } : {}),
        },
      });
      await tx.sapPostingAttempt.update({
        where: { id: attemptId },
        data: {
          finishedAt: now,
          success: true,
          response: { documentNumber: result!.documentNumber, fiscalYear: result!.fiscalYear, reusedExisting: reused } as Prisma.InputJsonValue,
        },
      });
      await tx.expenseRequest.updateMany({
        where: { requestId: posting.requestId },
        data: { sapDocNumber: result!.documentNumber, sapFiscalYear: result!.fiscalYear, sapPostedAt: now },
      });
      await tx.requestEvent.create({
        data: {
          requestId: posting.requestId,
          type: 'SAP_POSTED',
          actorType: trigger === 'MANUAL' ? 'USER' : 'SYSTEM',
          actorUserId: o?.userId ?? null,
          data: { documentNumber: result!.documentNumber, fiscalYear: result!.fiscalYear, adapter: posting.adapter },
        },
      });
      return updated;
    });
  } catch (e) {
    const msg = errText(e);
    const now = new Date();
    const attempts = posting.attempts + 1;
    await prisma.$transaction(async (tx) => {
      await tx.sapPosting.update({
        where: { id: postingId },
        data: { status: 'FAILED', lastError: msg },
      });
      await tx.sapPostingAttempt.update({ where: { id: attemptId }, data: { finishedAt: now, success: false, error: msg } });
      await tx.requestEvent.create({
        data: {
          requestId: posting.requestId,
          type: 'SAP_FAILED',
          actorType: trigger === 'MANUAL' ? 'USER' : 'SYSTEM',
          actorUserId: o?.userId ?? null,
          comment: msg,
          data: { attempt: attempts, adapter: posting.adapter },
        },
      });
    });
    if (trigger === 'AUTO' && attempts >= MAX_AUTO_ATTEMPTS) await notifySapFailure(prisma, posting, msg).catch(() => undefined);
    throw e; // the job retries with backoff; the request stays PAID
  }
}

/** In-app notification for every holder of `sap.retry` after the last automatic attempt failed. */
async function notifySapFailure(prisma: PrismaClient, posting: SapPosting, msg: string): Promise<void> {
  const req = await prisma.request.findUnique({ where: { id: posting.requestId }, select: { number: true } });
  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      roles: { some: { role: { isActive: true, OR: [{ isSuperUser: true }, { permissions: { some: { permissionCode: 'sap.retry' } } }] } } },
    },
    select: { id: true },
  });
  if (!users.length) return;
  await prisma.notification.createMany({
    data: users.map((u) => ({
      channel: 'IN_APP' as const,
      recipientUserId: u.id,
      type: 'SAP_FAILED',
      requestId: posting.requestId,
      titleAr: 'فشل ترحيل قيد SAP',
      titleEn: 'SAP posting failed',
      bodyAr: `فشل ترحيل الطلب ${req?.number ?? ''} إلى SAP بعد ${MAX_AUTO_ATTEMPTS} محاولات. يرجى إعادة المحاولة يدوياً.`,
      bodyEn: `Posting of ${req?.number ?? ''} to SAP failed after ${MAX_AUTO_ATTEMPTS} attempts. ${msg}`.slice(0, 500),
      data: { postingId: posting.id },
      status: 'SENT' as const,
      sentAt: new Date(),
    })),
  });
}

/**
 * Manual retry: resets the SAME job row (never a second posting row). The next worker run records a MANUAL attempt.
 */
export async function retrySapPosting(prisma: PrismaClient, postingId: string, userId: string): Promise<SapPosting> {
  const p = await prisma.sapPosting.findUnique({ where: { id: postingId } });
  if (!p) throw new DomainError('NOT_FOUND', 'SAP posting not found');
  if (p.status === 'POSTED') throw new DomainError('INVALID_STATE', 'Posting is already POSTED');
  if (p.status === 'POSTING') throw new DomainError('INVALID_STATE', 'Posting is in progress');
  const dedupeKey = `sap.post:${p.requestId}`;
  const payload = { postingId: p.id, trigger: 'MANUAL', userId };
  const existing = await prisma.job.findUnique({ where: { dedupeKey } });
  if (existing) {
    if (existing.status === 'RUNNING') throw new DomainError('INVALID_STATE', 'Posting job is running');
    await prisma.job.update({
      where: { id: existing.id },
      data: { status: 'PENDING', attempts: 0, runAt: new Date(), lockedAt: null, lockedBy: null, lastError: null, finishedAt: null, payload },
    });
  } else {
    await enqueueJob(prisma, { type: 'sap.post', payload, dedupeKey });
  }
  return prisma.sapPosting.update({ where: { id: p.id }, data: { status: 'PENDING', nextRetryAt: null } });
}
