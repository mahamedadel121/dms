import { randomBytes } from 'node:crypto';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Prisma } from '@prisma/client';
import { audit, toJsonValue } from '@dms/core/audit';
import {
  createDraftVersion,
  deleteDraftVersion,
  publishWorkflowVersion,
  saveDraftVersion,
  simulateWorkflow,
} from '@dms/core/engine';
import { DomainError } from '@dms/core/errors';
import { sniffMime } from '@dms/core/media';
import type { AuthUser } from '@dms/core/rbac';
import { getStorage, signFileUrl } from '@dms/core/storage';
import {
  createVersionBodySchema,
  lineCategoryInputSchema,
  lineCategoryUpdateSchema,
  requestTypeInputSchema,
  requestTypeUpdateSchema,
  saveWorkflowVersionBodySchema,
  simulateBodySchema,
  templateConfigSchema,
  templateVersionBodySchema,
  type LineCategoryInput,
  type RequestTypeInput,
  type SaveWorkflowVersionBody,
  type SimulateBody,
  type TemplateVersionBody,
} from '@dms/shared';
import { actorFromReq } from '../common/actor';
import { AuthOnly, CurrentUser, RequirePermission } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../prisma/prisma.service';

type Req_ = Parameters<typeof actorFromReq>[0];
const iso = (d: Date | null) => (d ? d.toISOString() : null);
const dstr = (d: { toString(): string } | null) => (d === null ? null : d.toString());

// ------------------------------------------------------------------ request types
function catDto(c: Prisma.LineCategoryGetPayload<{ include: { approvalRoles: true } }>) {
  return {
    id: c.id,
    requestTypeId: c.requestTypeId,
    code: c.code,
    nameAr: c.nameAr,
    nameEn: c.nameEn,
    icon: c.icon,
    sortOrder: c.sortOrder,
    isActive: c.isActive,
    extraFields: c.extraFields,
    quantityFieldKey: c.quantityFieldKey,
    unitPriceMin: dstr(c.unitPriceMin),
    unitPriceMax: dstr(c.unitPriceMax),
    minAttachments: c.minAttachments,
    maxAttachments: c.maxAttachments,
    maxAmountWarning: dstr(c.maxAmountWarning),
    approvalRoleIds: c.approvalRoles.map((r) => r.roleId),
  };
}
function typeDto(t: Prisma.RequestTypeGetPayload<{ include: { workflow: true; lineCategories: { include: { approvalRoles: true } } } }>, withCats: boolean) {
  return {
    id: t.id,
    code: t.code,
    nameAr: t.nameAr,
    nameEn: t.nameEn,
    departmentId: t.departmentId,
    numberPrefix: t.numberPrefix,
    moduleKey: t.moduleKey,
    headerFields: t.headerFields,
    hasLines: t.hasLines,
    channels: t.channels,
    settings: t.settings,
    isActive: t.isActive,
    workflowId: t.workflow?.id ?? null,
    ...(withCats ? { lineCategories: t.lineCategories.map(catDto) } : {}),
  };
}
const typeInclude = { workflow: true, lineCategories: { include: { approvalRoles: true }, orderBy: { sortOrder: 'asc' as const } } };

@Controller('request-types')
export class RequestTypesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @AuthOnly()
  async list() {
    const rows = await this.prisma.requestType.findMany({ include: typeInclude, orderBy: { code: 'asc' } });
    return rows.map((r) => typeDto(r, false));
  }

  @Get(':id')
  @AuthOnly()
  async get(@Param('id') id: string) {
    const t = await this.prisma.requestType.findUnique({ where: { id }, include: typeInclude });
    if (!t) throw new DomainError('NOT_FOUND', 'Request type not found');
    return typeDto(t, true);
  }

  @Post()
  @RequirePermission('request_types.manage')
  async create(@Req() req: Req_, @Body(new ZodPipe(requestTypeInputSchema)) b: RequestTypeInput) {
    if (await this.prisma.requestType.findFirst({ where: { OR: [{ code: b.code }, { numberPrefix: b.numberPrefix }] } })) {
      throw new DomainError('CONFLICT', 'Request type code or number prefix already exists');
    }
    const t = await this.prisma.$transaction(async (tx) => {
      const created = await tx.requestType.create({
        data: {
          code: b.code,
          nameAr: b.nameAr,
          nameEn: b.nameEn,
          departmentId: b.departmentId ?? null,
          numberPrefix: b.numberPrefix,
          moduleKey: b.moduleKey ?? null,
          headerFields: toJsonValue(b.headerFields) ?? [],
          hasLines: b.hasLines,
          channels: b.channels,
          settings: toJsonValue(b.settings) ?? {},
          isActive: b.isActive,
        },
      });
      const wf = await tx.workflow.create({ data: { requestTypeId: created.id, nameAr: b.nameAr, nameEn: b.nameEn } });
      await tx.workflowVersion.create({ data: { workflowId: wf.id, version: 1, status: 'DRAFT' } });
      await audit(tx, { actor: actorFromReq(req), action: 'request_type.create', entityType: 'RequestType', entityId: created.id, after: b });
      return tx.requestType.findUniqueOrThrow({ where: { id: created.id }, include: typeInclude });
    });
    return typeDto(t, true);
  }

  @Patch(':id')
  @RequirePermission('request_types.manage')
  async update(@Req() req: Req_, @Param('id') id: string, @Body(new ZodPipe(requestTypeUpdateSchema)) b: Partial<RequestTypeInput>) {
    const before = await this.prisma.requestType.findUnique({ where: { id } });
    if (!before) throw new DomainError('NOT_FOUND', 'Request type not found');
    const data: Prisma.RequestTypeUncheckedUpdateInput = {};
    for (const k of ['nameAr', 'nameEn', 'departmentId', 'moduleKey', 'hasLines', 'channels', 'isActive'] as const) {
      if (b[k] !== undefined) (data as Record<string, unknown>)[k] = b[k];
    }
    if (b.headerFields !== undefined) data.headerFields = toJsonValue(b.headerFields) ?? [];
    if (b.settings !== undefined) data.settings = toJsonValue(b.settings) ?? {};
    const t = await this.prisma.$transaction(async (tx) => {
      await tx.requestType.update({ where: { id }, data });
      await audit(tx, { actor: actorFromReq(req), action: 'request_type.update', entityType: 'RequestType', entityId: id, before, after: b });
      return tx.requestType.findUniqueOrThrow({ where: { id }, include: typeInclude });
    });
    return typeDto(t, true);
  }

  @Post(':id/line-categories')
  @RequirePermission('request_types.manage')
  async addCategory(@Req() req: Req_, @Param('id') id: string, @Body(new ZodPipe(lineCategoryInputSchema)) b: LineCategoryInput) {
    if (!(await this.prisma.requestType.findUnique({ where: { id } }))) throw new DomainError('NOT_FOUND', 'Request type not found');
    const c = await this.prisma.$transaction(async (tx) => {
      const created = await tx.lineCategory.create({
        data: {
          requestTypeId: id,
          code: b.code,
          nameAr: b.nameAr,
          nameEn: b.nameEn,
          icon: b.icon ?? null,
          sortOrder: b.sortOrder,
          isActive: b.isActive,
          extraFields: toJsonValue(b.extraFields) ?? [],
          quantityFieldKey: b.quantityFieldKey ?? null,
          unitPriceMin: b.unitPriceMin ?? null,
          unitPriceMax: b.unitPriceMax ?? null,
          minAttachments: b.minAttachments,
          maxAttachments: b.maxAttachments,
          maxAmountWarning: b.maxAmountWarning ?? null,
          approvalRoles: { create: b.approvalRoleIds.map((roleId) => ({ roleId })) },
        },
        include: { approvalRoles: true },
      });
      await audit(tx, { actor: actorFromReq(req), action: 'line_category.create', entityType: 'LineCategory', entityId: created.id, after: b });
      return created;
    });
    return catDto(c);
  }

  @Patch(':id/line-categories/:cid')
  @RequirePermission('request_types.manage')
  async updateCategory(
    @Req() req: Req_,
    @Param('id') id: string,
    @Param('cid') cid: string,
    @Body(new ZodPipe(lineCategoryUpdateSchema)) b: Partial<LineCategoryInput>,
  ) {
    const before = await this.prisma.lineCategory.findFirst({ where: { id: cid, requestTypeId: id }, include: { approvalRoles: true } });
    if (!before) throw new DomainError('NOT_FOUND', 'Category not found');
    const c = await this.prisma.$transaction(async (tx) => {
      const data: Prisma.LineCategoryUncheckedUpdateInput = {};
      for (const k of ['nameAr', 'nameEn', 'icon', 'sortOrder', 'isActive', 'quantityFieldKey', 'minAttachments', 'maxAttachments'] as const) {
        if (b[k] !== undefined) (data as Record<string, unknown>)[k] = b[k];
      }
      if (b.extraFields !== undefined) data.extraFields = toJsonValue(b.extraFields) ?? [];
      if (b.unitPriceMin !== undefined) data.unitPriceMin = b.unitPriceMin;
      if (b.unitPriceMax !== undefined) data.unitPriceMax = b.unitPriceMax;
      if (b.maxAmountWarning !== undefined) data.maxAmountWarning = b.maxAmountWarning;
      await tx.lineCategory.update({ where: { id: cid }, data });
      if (b.approvalRoleIds) {
        await tx.lineCategoryApprovalRole.deleteMany({ where: { lineCategoryId: cid } });
        await tx.lineCategoryApprovalRole.createMany({ data: b.approvalRoleIds.map((roleId) => ({ lineCategoryId: cid, roleId })) });
      }
      await audit(tx, { actor: actorFromReq(req), action: 'line_category.update', entityType: 'LineCategory', entityId: cid, before: catDto(before), after: b });
      return tx.lineCategory.findUniqueOrThrow({ where: { id: cid }, include: { approvalRoles: true } });
    });
    return catDto(c);
  }
}

// ------------------------------------------------------------------ workflows
function versionDto(v: Prisma.WorkflowVersionGetPayload<{ include: { steps: { include: { role: true } } } }> | Prisma.WorkflowVersionGetPayload<object>, withSteps: boolean) {
  const steps = (v as { steps?: Prisma.WorkflowStepGetPayload<{ include: { role: true } }>[] }).steps;
  return {
    id: v.id,
    workflowId: v.workflowId,
    version: v.version,
    status: v.status,
    note: v.note,
    createdAt: v.createdAt.toISOString(),
    publishedAt: iso(v.publishedAt),
    ...(withSteps && steps
      ? {
          steps: [...steps]
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((s) => ({
              id: s.id,
              key: s.key,
              sortOrder: s.sortOrder,
              stepType: s.stepType,
              kind: s.kind,
              nameAr: s.nameAr,
              nameEn: s.nameEn,
              roleId: s.roleId,
              roleName: s.role?.nameAr ?? null,
              parallelGroup: s.parallelGroup,
              condition: s.condition,
              allowedActions: s.allowedActions,
              canEditAmounts: s.canEditAmounts,
              canReclassify: s.canReclassify,
              checklist: s.checklist,
              slaHours: s.slaHours,
              showInSignatures: s.showInSignatures,
            })),
        }
      : {}),
  };
}

@Controller()
export class WorkflowsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('workflows')
  @RequirePermission('workflows.view', 'workflows.manage')
  async list() {
    const rows = await this.prisma.workflow.findMany({ include: { requestType: true, versions: { orderBy: { version: 'desc' } } } });
    return rows.map((w) => ({
      id: w.id,
      requestTypeId: w.requestTypeId,
      requestTypeCode: w.requestType.code,
      nameAr: w.nameAr,
      nameEn: w.nameEn,
      isActive: w.isActive,
      activeVersion: w.versions.find((v) => v.status === 'ACTIVE')?.version ?? null,
    }));
  }

  @Get('workflows/:id')
  @RequirePermission('workflows.view', 'workflows.manage')
  async get(@Param('id') id: string) {
    const w = await this.prisma.workflow.findUnique({ where: { id }, include: { requestType: true, versions: { orderBy: { version: 'desc' } } } });
    if (!w) throw new DomainError('NOT_FOUND', 'Workflow not found');
    return {
      id: w.id,
      requestTypeId: w.requestTypeId,
      requestTypeCode: w.requestType.code,
      nameAr: w.nameAr,
      nameEn: w.nameEn,
      isActive: w.isActive,
      versions: w.versions.map((v) => versionDto(v, false)),
    };
  }

  @Get('workflow-versions/:id')
  @RequirePermission('workflows.view', 'workflows.manage')
  async version(@Param('id') id: string) {
    const v = await this.prisma.workflowVersion.findUnique({ where: { id }, include: { steps: { include: { role: true } } } });
    if (!v) throw new DomainError('NOT_FOUND', 'Version not found');
    return versionDto(v, true);
  }

  @Post('workflows/:id/versions')
  @RequirePermission('workflows.manage')
  async createVersion(@Req() req: Req_, @Param('id') id: string, @Body(new ZodPipe(createVersionBodySchema)) b: { basedOnVersionId?: string }) {
    return createDraftVersion(this.prisma, id, b.basedOnVersionId, actorFromReq(req));
  }

  @Put('workflow-versions/:id')
  @RequirePermission('workflows.manage')
  async save(@Req() req: Req_, @Param('id') id: string, @Body(new ZodPipe(saveWorkflowVersionBodySchema)) b: SaveWorkflowVersionBody) {
    await saveDraftVersion(this.prisma, id, b, actorFromReq(req));
    return this.version(id);
  }

  @Post('workflow-versions/:id/publish')
  @HttpCode(200)
  @RequirePermission('workflows.manage')
  async publish(@Req() req: Req_, @Param('id') id: string) {
    await publishWorkflowVersion(this.prisma, id, actorFromReq(req));
    return this.version(id);
  }

  @Delete('workflow-versions/:id')
  @RequirePermission('workflows.manage')
  async remove(@Req() req: Req_, @Param('id') id: string) {
    await deleteDraftVersion(this.prisma, id, actorFromReq(req));
    return { ok: true };
  }

  @Post('workflow-versions/:id/simulate')
  @HttpCode(200)
  @RequirePermission('workflows.manage')
  async simulate(@Param('id') id: string, @Body(new ZodPipe(simulateBodySchema)) b: SimulateBody) {
    return simulateWorkflow(this.prisma, id, b);
  }
}

// ------------------------------------------------------------------ templates
function tvDto(v: Prisma.TemplateVersionGetPayload<object>) {
  return {
    id: v.id,
    templateId: v.templateId,
    version: v.version,
    status: v.status,
    layoutKey: v.layoutKey,
    config: v.config,
    note: v.note,
    createdAt: v.createdAt.toISOString(),
    publishedAt: iso(v.publishedAt),
  };
}

@Controller()
export class TemplatesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('templates')
  @RequirePermission('templates.manage')
  async list(@Query('requestTypeId') requestTypeId?: string) {
    const rows = await this.prisma.template.findMany({
      where: requestTypeId ? { requestTypeId } : {},
      include: { versions: { orderBy: { version: 'desc' } } },
      orderBy: { code: 'asc' },
    });
    return rows.map((t) => ({
      id: t.id,
      requestTypeId: t.requestTypeId,
      code: t.code,
      nameAr: t.nameAr,
      nameEn: t.nameEn,
      isDefault: t.isDefault,
      isActive: t.isActive,
      activeVersion: t.versions.find((v) => v.status === 'ACTIVE')?.version ?? null,
    }));
  }

  @Post('templates/logo')
  @RequirePermission('templates.manage')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } }))
  async logo(@Req() req: Req_, @UploadedFile() file?: { buffer: Buffer }) {
    if (!file) throw new DomainError('VALIDATION', 'file is required');
    const mime = sniffMime(file.buffer);
    if (mime !== 'image/png' && mime !== 'image/jpeg') throw new DomainError('VALIDATION', 'Logo must be a PNG or JPEG image');
    const key = `logos/${randomBytes(12).toString('hex')}.${mime === 'image/png' ? 'png' : 'jpg'}`;
    await getStorage().put(key, file.buffer, { contentType: mime, ifNotExists: true });
    await audit(this.prisma, { actor: actorFromReq(req), action: 'template.logo.upload', entityType: 'Template', meta: { key } });
    return { key, url: signFileUrl(key) };
  }

  @Get('templates/:id')
  @RequirePermission('templates.manage')
  async get(@Param('id') id: string) {
    const t = await this.prisma.template.findUnique({ where: { id }, include: { versions: { orderBy: { version: 'desc' } } } });
    if (!t) throw new DomainError('NOT_FOUND', 'Template not found');
    return {
      id: t.id,
      requestTypeId: t.requestTypeId,
      code: t.code,
      nameAr: t.nameAr,
      nameEn: t.nameEn,
      isDefault: t.isDefault,
      isActive: t.isActive,
      versions: t.versions.map(tvDto),
    };
  }

  @Get('template-versions/:id')
  @RequirePermission('templates.manage')
  async version(@Param('id') id: string) {
    const v = await this.prisma.templateVersion.findUnique({ where: { id } });
    if (!v) throw new DomainError('NOT_FOUND', 'Version not found');
    return tvDto(v);
  }

  @Post('templates/:id/versions')
  @RequirePermission('templates.manage')
  async createVersion(@CurrentUser() user: AuthUser, @Req() req: Req_, @Param('id') id: string) {
    const v = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM templates WHERE id = ${id} FOR UPDATE`;
      if (await tx.templateVersion.findFirst({ where: { templateId: id, status: 'DRAFT' } })) {
        throw new DomainError('CONFLICT', 'A draft version already exists');
      }
      const base =
        (await tx.templateVersion.findFirst({ where: { templateId: id, status: 'ACTIVE' } })) ??
        (await tx.templateVersion.findFirst({ where: { templateId: id }, orderBy: { version: 'desc' } }));
      if (!base) throw new DomainError('NOT_FOUND', 'Template not found');
      const max = await tx.templateVersion.aggregate({ where: { templateId: id }, _max: { version: true } });
      const created = await tx.templateVersion.create({
        data: {
          templateId: id,
          version: (max._max.version ?? 0) + 1,
          status: 'DRAFT',
          layoutKey: base.layoutKey,
          config: base.config as Prisma.InputJsonValue,
          createdById: user.id,
          note: `Based on v${base.version}`,
        },
      });
      await audit(tx, { actor: actorFromReq(req), action: 'template.version.create', entityType: 'TemplateVersion', entityId: created.id });
      return created;
    });
    return tvDto(v);
  }

  @Put('template-versions/:id')
  @RequirePermission('templates.manage')
  async save(@Req() req: Req_, @Param('id') id: string, @Body(new ZodPipe(templateVersionBodySchema)) b: TemplateVersionBody) {
    const v = await this.prisma.templateVersion.findUnique({ where: { id } });
    if (!v) throw new DomainError('NOT_FOUND', 'Version not found');
    if (v.status !== 'DRAFT') throw new DomainError('INVALID_STATE', 'Only DRAFT versions can be edited');
    const data: Prisma.TemplateVersionUncheckedUpdateInput = {};
    if (b.config) data.config = templateConfigSchema.parse(b.config) as Prisma.InputJsonValue;
    if (b.layoutKey) data.layoutKey = b.layoutKey;
    if (b.note !== undefined) data.note = b.note;
    const u = await this.prisma.templateVersion.update({ where: { id }, data });
    await audit(this.prisma, { actor: actorFromReq(req), action: 'template.version.save', entityType: 'TemplateVersion', entityId: id, before: v.config, after: u.config });
    return tvDto(u);
  }

  @Post('template-versions/:id/publish')
  @HttpCode(200)
  @RequirePermission('templates.manage')
  async publish(@CurrentUser() user: AuthUser, @Req() req: Req_, @Param('id') id: string) {
    const out = await this.prisma.$transaction(async (tx) => {
      const v0 = await tx.templateVersion.findUnique({ where: { id } });
      if (!v0) throw new DomainError('NOT_FOUND', 'Version not found');
      await tx.$queryRaw`SELECT id FROM templates WHERE id = ${v0.templateId} FOR UPDATE`;
      const v = await tx.templateVersion.findUniqueOrThrow({ where: { id } });
      if (v.status !== 'DRAFT') throw new DomainError('INVALID_STATE', 'Only DRAFT versions can be published');
      const parsed = templateConfigSchema.safeParse(v.config);
      if (!parsed.success) throw new DomainError('VALIDATION', 'Template config is invalid', undefined, parsed.error.issues);
      await tx.templateVersion.updateMany({ where: { templateId: v.templateId, status: 'ACTIVE' }, data: { status: 'ARCHIVED' } });
      const u = await tx.templateVersion.update({ where: { id }, data: { status: 'ACTIVE', publishedAt: new Date(), publishedById: user.id } });
      await audit(tx, { actor: actorFromReq(req), action: 'template.version.publish', entityType: 'TemplateVersion', entityId: id });
      return u;
    });
    return tvDto(out);
  }
}
