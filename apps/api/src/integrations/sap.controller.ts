import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { Prisma, SapPosting, Request as RequestRow } from '@prisma/client';
import {
  sapPostingsQuerySchema,
  sapRetryBodySchema,
  type SapRetryBody,
  type SapPostingDetail,
  type SapPostingList,
  type SapPostingListItem,
  type SapPostingsQuery,
} from '@dms/shared';
import { audit } from '@dms/core/audit';
import { DomainError } from '@dms/core/errors';
import { retrySapPosting } from '@dms/core/sap';
import type { AuthUser } from '@dms/core/rbac';
import { actorFromReq, CurrentUser, RequirePermission, ZodPipe } from '../common';
import { PrismaService } from '../prisma/prisma.service';

type Row = SapPosting & { request: Pick<RequestRow, 'number' | 'totalFinal' | 'paidAt'> };

function toItem(p: Row): SapPostingListItem {
  return {
    id: p.id,
    requestId: p.requestId,
    requestNumber: p.request.number,
    status: p.status,
    adapter: p.adapter,
    attempts: p.attempts,
    lastError: p.lastError,
    nextRetryAt: p.nextRetryAt?.toISOString() ?? null,
    sapDocNumber: p.sapDocNumber,
    sapFiscalYear: p.sapFiscalYear,
    postedAt: p.postedAt?.toISOString() ?? null,
    totalFinal: p.request.totalFinal.toString(),
    paidAt: p.request.paidAt?.toISOString() ?? null,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

const REQ_SELECT = { select: { number: true, totalFinal: true, paidAt: true } } as const;

@Controller('sap/postings')
export class SapController {
  constructor(private readonly prisma: PrismaService) {}

  @RequirePermission('sap.view')
  @Get()
  async list(@Query(new ZodPipe(sapPostingsQuerySchema)) q: SapPostingsQuery): Promise<SapPostingList> {
    const where: Prisma.SapPostingWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.number ? { request: { number: { contains: q.number, mode: 'insensitive' } } } : {}),
      ...(q.from || q.to
        ? { createdAt: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(q.to) } : {}) } }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.sapPosting.findMany({
        where,
        include: { request: REQ_SELECT },
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.sapPosting.count({ where }),
    ]);
    return { items: rows.map(toItem), total, page: q.page, pageSize: q.pageSize };
  }

  @RequirePermission('sap.view')
  @Get(':id')
  async detail(@Param('id') id: string): Promise<SapPostingDetail> {
    const p = await this.prisma.sapPosting.findUnique({
      where: { id },
      include: { request: REQ_SELECT, attemptLogs: { orderBy: { attemptNo: 'asc' } } },
    });
    if (!p) throw new DomainError('NOT_FOUND', 'SAP posting not found');
    return {
      ...toItem(p),
      idempotencyKey: p.idempotencyKey,
      sapCompanyCode: p.sapCompanyCode,
      exportFileKey: p.exportFileKey,
      payload: p.payload,
      attemptLogs: p.attemptLogs.map((a) => ({
        id: a.id,
        attemptNo: a.attemptNo,
        trigger: a.trigger as 'AUTO' | 'MANUAL',
        triggeredById: a.triggeredById,
        startedAt: a.startedAt.toISOString(),
        finishedAt: a.finishedAt?.toISOString() ?? null,
        success: a.success,
        error: a.error,
        response: a.response,
      })),
    };
  }

  /** Resets the same job row; the worker performs the attempt (trigger MANUAL). */
  @RequirePermission('sap.retry')
  @Post(':id/retry')
  async retry(
    @Param('id') id: string,
    @Body(new ZodPipe(sapRetryBodySchema)) b: SapRetryBody,
    @CurrentUser() user: AuthUser,
    @Req() req: Parameters<typeof actorFromReq>[0],
  ): Promise<SapPostingListItem> {
    const before = await this.prisma.sapPosting.findUnique({ where: { id }, select: { status: true } });
    const p = await retrySapPosting(this.prisma, id, user.id, { force: b.force });
    await audit(this.prisma, {
      actor: actorFromReq({ ...req, user }),
      action: 'sap.retry',
      entityType: 'SapPosting',
      entityId: id,
      before: { status: before?.status },
      after: { status: p.status },
    });
    if (b.force) {
      await audit(this.prisma, {
        actor: actorFromReq({ ...req, user }),
        action: 'sap.posting.force_retry',
        entityType: 'SapPosting',
        entityId: id,
        before: { status: before?.status },
        after: { status: p.status, force: true },
      });
    }
    const full = await this.prisma.sapPosting.findUniqueOrThrow({ where: { id }, include: { request: REQ_SELECT } });
    return toItem(full);
  }
}
