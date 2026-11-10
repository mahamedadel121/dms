import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
  acquireLock,
  approveStep,
  canViewRequest,
  editLine,
  getRequestDetail,
  heartbeatLock,
  listQueue,
  listRequests,
  queueCounters,
  rejectRequest,
  releaseLock,
  requestCorrection,
  sendBack,
  submitRequest,
} from '@dms/core/engine';
import { DomainError } from '@dms/core/errors';
import { ingestAttachment } from '@dms/core/media';
import type { AuthUser } from '@dms/core/rbac';
import { getStorage } from '@dms/core/storage';
import {
  approveBodySchema,
  editLineBodySchema,
  queueQuerySchema,
  rejectBodySchema,
  requestCorrectionBodySchema,
  requestListQuerySchema,
  sendBackBodySchema,
  submitRequestBodySchema,
  type ApproveBody,
  type EditLineBody,
  type QueueQuery,
  type RejectBody,
  type RequestCorrectionBody,
  type RequestListQuery,
  type SendBackBody,
  type SubmitRequestBody,
} from '@dms/shared';
import { actorFromReq } from '../common/actor';
import { CurrentUser, RequirePermission } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../prisma/prisma.service';

type Req_ = Parameters<typeof actorFromReq>[0];

@Controller('requests')
export class RequestsController {
  constructor(private readonly prisma: PrismaService) {}

  private async assertView(user: AuthUser, id: string): Promise<void> {
    if (!(await canViewRequest(this.prisma, user, id))) throw new DomainError('FORBIDDEN', 'You cannot view this request');
  }

  // NOTE: static routes first so ':id' does not swallow them.
  @Get('queue')
  @RequirePermission('requests.view', 'requests.view_all')
  queue(@CurrentUser() user: AuthUser, @Query(new ZodPipe(queueQuerySchema)) q: QueueQuery) {
    return listQueue(this.prisma, user, q);
  }

  @Get('queue/counters')
  @RequirePermission('requests.view', 'requests.view_all')
  counters(@CurrentUser() user: AuthUser) {
    return queueCounters(this.prisma, user);
  }

  @Get()
  @RequirePermission('requests.view', 'requests.view_all')
  list(@CurrentUser() user: AuthUser, @Query(new ZodPipe(requestListQuerySchema)) q: RequestListQuery) {
    return listRequests(this.prisma, user, q);
  }

  @Post('attachments')
  @RequirePermission('requests.create')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } }))
  async upload(@CurrentUser() user: AuthUser, @UploadedFile() file?: { buffer: Buffer; originalname: string }) {
    if (!file) throw new DomainError('VALIDATION', 'file is required');
    const a = await ingestAttachment(this.prisma, getStorage(), {
      bytes: file.buffer,
      originalName: file.originalname,
      uploadedByUserId: user.id,
    });
    return { attachmentId: a.id, mimeType: a.mimeType };
  }

  @Post()
  @RequirePermission('requests.create')
  async submit(@CurrentUser() user: AuthUser, @Req() req: Req_, @Body(new ZodPipe(submitRequestBodySchema)) body: SubmitRequestBody) {
    return submitRequest(this.prisma, { ...body, channel: 'WEB', submittedByUserId: user.id }, actorFromReq(req));
  }

  @Get(':id')
  @RequirePermission('requests.view', 'requests.view_all')
  async detail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.assertView(user, id);
    return getRequestDetail(this.prisma, id, user);
  }

  @Post(':id/lock')
  @HttpCode(200)
  @RequirePermission('requests.act')
  async lock(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.assertView(user, id);
    return acquireLock(this.prisma, id, user);
  }

  @Post(':id/lock/heartbeat')
  @HttpCode(200)
  @RequirePermission('requests.act')
  async heartbeat(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.assertView(user, id);
    return heartbeatLock(this.prisma, id, user);
  }

  @Delete(':id/lock')
  @RequirePermission('requests.act', 'requests.force_unlock')
  async unlock(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query('force') force?: string) {
    await this.assertView(user, id);
    await releaseLock(this.prisma, id, user, force === '1' || force === 'true');
    return { ok: true };
  }

  @Post(':id/steps/:sid/approve')
  @HttpCode(200)
  @RequirePermission('requests.act')
  async approve(
    @CurrentUser() user: AuthUser,
    @Req() req: Req_,
    @Param('id') id: string,
    @Param('sid') sid: string,
    @Body(new ZodPipe(approveBodySchema)) body: ApproveBody,
  ) {
    await approveStep(this.prisma, { requestId: id, stepInstanceId: sid, user, ...body, actor: actorFromReq(req) });
    return { ok: true };
  }

  @Post(':id/steps/:sid/request-correction')
  @HttpCode(200)
  @RequirePermission('requests.act')
  async correction(
    @CurrentUser() user: AuthUser,
    @Req() req: Req_,
    @Param('id') id: string,
    @Param('sid') sid: string,
    @Body(new ZodPipe(requestCorrectionBodySchema)) body: RequestCorrectionBody,
  ) {
    await requestCorrection(this.prisma, { requestId: id, stepInstanceId: sid, user, items: body.items, actor: actorFromReq(req) });
    return { ok: true };
  }

  @Post(':id/steps/:sid/send-back')
  @HttpCode(200)
  @RequirePermission('requests.act')
  async back(
    @CurrentUser() user: AuthUser,
    @Req() req: Req_,
    @Param('id') id: string,
    @Param('sid') sid: string,
    @Body(new ZodPipe(sendBackBodySchema)) body: SendBackBody,
  ) {
    await sendBack(this.prisma, { requestId: id, stepInstanceId: sid, user, comment: body.comment, actor: actorFromReq(req) });
    return { ok: true };
  }

  @Post(':id/steps/:sid/reject')
  @HttpCode(200)
  @RequirePermission('requests.act')
  async reject(
    @CurrentUser() user: AuthUser,
    @Req() req: Req_,
    @Param('id') id: string,
    @Param('sid') sid: string,
    @Body(new ZodPipe(rejectBodySchema)) body: RejectBody,
  ) {
    await rejectRequest(this.prisma, { requestId: id, stepInstanceId: sid, user, reason: body.reason, actor: actorFromReq(req) });
    return { ok: true };
  }

  @Patch(':id/lines/:lineId')
  @RequirePermission('requests.edit_amounts', 'requests.reclassify')
  async edit(
    @CurrentUser() user: AuthUser,
    @Req() req: Req_,
    @Param('id') id: string,
    @Param('lineId') lineId: string,
    @Body(new ZodPipe(editLineBodySchema)) body: EditLineBody,
  ) {
    await editLine(this.prisma, { requestId: id, lineId, user, ...body, actor: actorFromReq(req) });
    return { ok: true };
  }
}
