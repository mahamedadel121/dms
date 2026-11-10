import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
  type Type,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { audit } from '@dms/core/audit';
import { DomainError } from '@dms/core/errors';
import {
  MASTER_RESOURCES,
  masterListQuerySchema,
  type ImportResult,
  type MasterListQuery,
  type MasterResource,
  type Paged,
} from '@dms/shared';
import { actorFromReq } from '../common/actor';
import { RequirePermission } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { MasterService } from './master.service';

type Req_ = Parameters<typeof actorFromReq>[0];
type Row = Record<string, unknown>;
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** One controller class per master-data resource (explicit paths, so they never shadow other routes). */
function createMasterController(resource: MasterResource): Type<unknown> {
  @Controller(resource)
  class MasterController {
    constructor(@Inject(MasterService) private readonly svc: MasterService) {}

    @RequirePermission('masterdata.view')
    @Get()
    list(@Query(new ZodPipe(masterListQuerySchema)) q: MasterListQuery): Promise<Paged<Row>> {
      return this.svc.list(resource, q);
    }

    @RequirePermission('masterdata.view')
    @Get('export.xlsx')
    async exportXlsx(@Query(new ZodPipe(masterListQuerySchema)) q: MasterListQuery, @Res() res: never): Promise<void> {
      const buf = await this.svc.exportXlsx(resource, q);
      const r = res as { setHeader(k: string, v: string): void; send(b: Buffer): void };
      r.setHeader('Content-Type', XLSX);
      r.setHeader('Content-Disposition', `attachment; filename="${resource}.xlsx"`);
      r.send(buf);
    }

    @RequirePermission('masterdata.view')
    @Get(':id')
    get(@Param('id') id: string): Promise<Row> {
      return this.svc.get(resource, id);
    }

    @RequirePermission('masterdata.manage')
    @Post()
    create(@Body() body: unknown, @Req() req: Req_): Promise<Row> {
      return this.svc.create(resource, body, actorFromReq(req));
    }

    @RequirePermission('masterdata.manage')
    @Post('import')
    @HttpCode(200)
    @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }))
    importXlsx(
      @UploadedFile() file: { buffer: Buffer } | undefined,
      @Query('dryRun') dryRun: string | undefined,
      @Req() req: Req_,
    ): Promise<ImportResult> {
      if (!file) throw new DomainError('VALIDATION', 'Upload the .xlsx file in the "file" field');
      return this.svc.importXlsx(resource, file.buffer, dryRun === '1' || dryRun === 'true', actorFromReq(req));
    }

    @RequirePermission('masterdata.manage')
    @Patch(':id')
    update(@Param('id') id: string, @Body() body: unknown, @Req() req: Req_): Promise<Row> {
      return this.svc.update(resource, id, body, actorFromReq(req));
    }

    @RequirePermission('masterdata.manage')
    @Post(':id/activate')
    @HttpCode(200)
    activate(@Param('id') id: string, @Req() req: Req_): Promise<Row> {
      return this.svc.setActive(resource, id, true, actorFromReq(req));
    }

    @RequirePermission('masterdata.manage')
    @Post(':id/deactivate')
    @HttpCode(200)
    deactivate(@Param('id') id: string, @Req() req: Req_): Promise<Row> {
      return this.svc.setActive(resource, id, false, actorFromReq(req));
    }
  }
  Object.defineProperty(MasterController, 'name', { value: `Master_${resource.replace(/-/g, '_')}_Controller` });
  return MasterController;
}

export const MASTER_CONTROLLERS: Type<unknown>[] = MASTER_RESOURCES.map(createMasterController);

@Controller('submitters')
export class SubmitterExtrasController {
  constructor(private readonly prisma: PrismaService) {}

  /** Frees the driver's Telegram link so the same or another account can link again through the bot. */
  @RequirePermission('submitters.telegram_link')
  @Post(':id/telegram-unlink')
  @HttpCode(200)
  async unlink(@Param('id') id: string, @Req() req: Req_) {
    const s = await this.prisma.submitter.findUnique({ where: { id } });
    if (!s) throw new DomainError('NOT_FOUND', 'Driver not found');
    if (s.telegramUserId === null) throw new DomainError('INVALID_STATE', 'No Telegram account is linked');
    await this.prisma.$transaction(async (tx) => {
      await tx.submitter.update({
        where: { id },
        data: { telegramUserId: null, telegramChatId: null, telegramUsername: null, telegramLinkedAt: null },
      });
      await audit(tx, {
        actor: actorFromReq(req),
        action: 'submitter.telegram_unlink',
        entityType: 'Submitter',
        entityId: id,
        before: {
          telegramUserId: s.telegramUserId?.toString(),
          telegramUsername: s.telegramUsername,
          telegramLinkedAt: s.telegramLinkedAt,
        },
        after: { telegramUserId: null },
      });
      // pending bot conversations of this driver are no longer valid after unlinking
      await tx.botSession.updateMany({
        where: { submitterId: id },
        data: { submitterId: null, state: 'UNLINKED', draft: Prisma.DbNull, correction: Prisma.DbNull },
      });
    });
    return { ok: true };
  }
}
