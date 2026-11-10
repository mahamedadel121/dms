import { Body, Controller, Get, HttpCode, Param, Post, Put, Query, Req } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { audit } from '@dms/core/audit';
import { getSettings, setSetting } from '@dms/core/config';
import { DomainError } from '@dms/core/errors';
import type { AuthUser } from '@dms/core/rbac';
import {
  LOOKUP_ENTITIES,
  SETTING_DEFAULTS,
  auditQuerySchema,
  platformPageQuerySchema,
  settingUpdateSchema,
  type AuditQuery,
  type AuditRow,
  type LookupItem,
  type NotificationRow,
  type PageQuery,
  type Paged,
  type SettingKey,
  type SettingRow,
  type SettingUpdateInput,
} from '@dms/shared';
import { actorFromReq } from '../common/actor';
import { AuthOnly, CurrentUser, RequirePermission } from '../common/decorators';
import { pageArgs, paged } from '../common/paging';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../prisma/prisma.service';

type Req_ = Parameters<typeof actorFromReq>[0];

@Controller('audit-logs')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @RequirePermission('audit.view')
  @Get()
  async list(@Query(new ZodPipe(auditQuerySchema)) q: AuditQuery): Promise<Paged<AuditRow>> {
    const { skip, take, page, pageSize } = pageArgs(q);
    const and: Prisma.AuditLogWhereInput[] = [];
    if (q.entityType) and.push({ entityType: q.entityType });
    if (q.entityId) and.push({ entityId: q.entityId });
    if (q.actorUserId) and.push({ actorUserId: q.actorUserId });
    if (q.action) and.push({ action: { startsWith: q.action } });
    if (q.from || q.to) and.push({ createdAt: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: q.to } : {}) } });
    if (q.q) {
      and.push({
        OR: [
          { action: { contains: q.q, mode: 'insensitive' } },
          { entityType: { contains: q.q, mode: 'insensitive' } },
          { entityId: q.q },
          { actorLabel: { contains: q.q, mode: 'insensitive' } },
        ],
      });
    }
    const where: Prisma.AuditLogWhereInput = { AND: and };
    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({ where, skip, take, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }),
      this.prisma.auditLog.count({ where }),
    ]);
    const items: AuditRow[] = rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      actorType: r.actorType,
      actorUserId: r.actorUserId,
      actorLabel: r.actorLabel,
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      before: r.before,
      after: r.after,
      meta: r.meta,
      ip: r.ip,
    }));
    return paged(items, total, page, pageSize);
  }
}

const PUBLIC_SETTINGS: SettingKey[] = [
  'company.profile',
  'workflow.requireSignatureToApprove',
  'workflow.lockTimeoutMinutes',
  'expense.odometerMaxJumpKm',
  'media.maxFileSizeMb',
];

@Controller('settings')
export class SettingsController {
  constructor(private readonly prisma: PrismaService) {}

  @RequirePermission('settings.manage')
  @Get()
  async list(): Promise<SettingRow[]> {
    const [all, rows] = await Promise.all([getSettings(this.prisma), this.prisma.setting.findMany()]);
    const upd = new Map(rows.map((r) => [r.key, r.updatedAt]));
    return Object.entries(all).map(([key, value]) => ({ key, value, updatedAt: upd.get(key)?.toISOString() ?? null }));
  }

  @AuthOnly()
  @Get('public')
  async publicSettings(): Promise<Record<string, unknown>> {
    const all = await getSettings(this.prisma);
    return Object.fromEntries(PUBLIC_SETTINGS.map((k) => [k, all[k]]));
  }

  @RequirePermission('settings.manage')
  @Put(':key')
  async update(
    @Param('key') key: string,
    @Body(new ZodPipe(settingUpdateSchema)) b: SettingUpdateInput,
    @CurrentUser() u: AuthUser,
    @Req() req: Req_,
  ): Promise<SettingRow> {
    if (!(key in SETTING_DEFAULTS)) throw new DomainError('NOT_FOUND', `Unknown setting ${key}`);
    if (b.value === undefined) throw new DomainError('VALIDATION', 'value is required');
    const before = (await getSettings(this.prisma))[key as SettingKey];
    await setSetting(this.prisma, key as SettingKey, b.value as never, { userId: u.id });
    const after = (await getSettings(this.prisma))[key as SettingKey];
    await audit(this.prisma, { actor: actorFromReq(req), action: 'setting.update', entityType: 'Setting', entityId: key, before, after });
    const row = await this.prisma.setting.findUniqueOrThrow({ where: { key } });
    return { key, value: after, updatedAt: row.updatedAt.toISOString() };
  }
}

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly prisma: PrismaService) {}

  @AuthOnly()
  @Get()
  async list(
    @CurrentUser() u: AuthUser,
    @Query(new ZodPipe(platformPageQuerySchema)) q: PageQuery,
    @Query('unread') unread?: string,
  ): Promise<Paged<NotificationRow>> {
    const { skip, take, page, pageSize } = pageArgs(q);
    const where: Prisma.NotificationWhereInput = {
      recipientUserId: u.id,
      channel: 'IN_APP',
      ...(unread === '1' || unread === 'true' ? { readAt: null } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.notification.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
      this.prisma.notification.count({ where }),
    ]);
    const items = rows.map((n) => ({
      id: n.id,
      type: n.type,
      requestId: n.requestId,
      titleAr: n.titleAr,
      titleEn: n.titleEn,
      bodyAr: n.bodyAr,
      bodyEn: n.bodyEn,
      data: n.data,
      readAt: n.readAt?.toISOString() ?? null,
      createdAt: n.createdAt.toISOString(),
    }));
    return paged(items, total, page, pageSize);
  }

  @AuthOnly()
  @Get('unread-count')
  async unreadCount(@CurrentUser() u: AuthUser): Promise<{ count: number }> {
    return { count: await this.prisma.notification.count({ where: { recipientUserId: u.id, channel: 'IN_APP', readAt: null } }) };
  }

  @AuthOnly()
  @Post('read-all')
  @HttpCode(200)
  async readAll(@CurrentUser() u: AuthUser): Promise<{ updated: number }> {
    const r = await this.prisma.notification.updateMany({
      where: { recipientUserId: u.id, channel: 'IN_APP', readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: r.count };
  }

  @AuthOnly()
  @Post(':id/read')
  @HttpCode(200)
  async read(@CurrentUser() u: AuthUser, @Param('id') id: string): Promise<{ ok: true }> {
    const r = await this.prisma.notification.updateMany({
      where: { id, recipientUserId: u.id, readAt: null },
      data: { readAt: new Date() },
    });
    if (r.count === 0 && !(await this.prisma.notification.findFirst({ where: { id, recipientUserId: u.id } }))) {
      throw new DomainError('NOT_FOUND', 'Notification not found');
    }
    return { ok: true };
  }
}

@Controller('lookups')
export class LookupsController {
  constructor(private readonly prisma: PrismaService) {}

  @AuthOnly()
  @Get(':entity')
  async lookup(@Param('entity') entity: string, @Query('q') q?: string, @Query('limit') limitRaw?: string): Promise<LookupItem[]> {
    const take = Math.min(Math.max(Number(limitRaw) || 50, 1), 200);
    const has = (fields: string[]) => (q ? { OR: fields.map((f) => ({ [f]: { contains: q, mode: 'insensitive' as const } })) } : {});
    const p = this.prisma;
    switch (entity as (typeof LOOKUP_ENTITIES)[number]) {
      case 'roles':
        return (await p.role.findMany({ where: { isActive: true, ...has(['code', 'nameAr', 'nameEn']) }, orderBy: { code: 'asc' }, take })).map(
          (r) => ({ id: r.id, code: r.code, label: r.nameAr }),
        );
      case 'users':
        return (await p.user.findMany({ where: { isActive: true, ...has(['username', 'fullName']) }, orderBy: { fullName: 'asc' }, take })).map(
          (r) => ({ id: r.id, code: r.username, label: r.fullName }),
        );
      case 'departments':
        return (await p.department.findMany({ where: { isActive: true, ...has(['code', 'nameAr', 'nameEn']) }, orderBy: { code: 'asc' }, take })).map(
          (r) => ({ id: r.id, code: r.code, label: r.nameAr }),
        );
      case 'submitters':
        return (await p.submitter.findMany({ where: { isActive: true, ...has(['code', 'fullName', 'phone']) }, orderBy: { code: 'asc' }, take })).map(
          (r) => ({ id: r.id, code: r.code, label: r.fullName }),
        );
      case 'vehicles':
        return (await p.vehicle.findMany({ where: { isActive: true, ...has(['number', 'plateNumber']) }, orderBy: { number: 'asc' }, take })).map(
          (r) => ({ id: r.id, code: r.number, label: r.number }),
        );
      case 'vehicle-types':
        return (await p.vehicleType.findMany({ where: { isActive: true, ...has(['code', 'nameAr', 'nameEn']) }, orderBy: { code: 'asc' }, take })).map(
          (r) => ({ id: r.id, code: r.code, label: r.nameAr }),
        );
      case 'cost-centers':
        return (await p.costCenter.findMany({ where: { isActive: true, ...has(['code', 'name']) }, orderBy: { code: 'asc' }, take })).map(
          (r) => ({ id: r.id, code: r.code, label: `${r.code} - ${r.name}` }),
        );
      case 'gl-accounts':
        return (await p.glAccount.findMany({ where: { isActive: true, ...has(['number', 'nameAr', 'nameEn']) }, orderBy: { number: 'asc' }, take })).map(
          (r) => ({ id: r.id, code: r.number, label: `${r.number} - ${r.nameAr}` }),
        );
      case 'expense-types':
        return (
          await p.lineCategory.findMany({
            where: { isActive: true, expenseConfig: { isNot: null }, ...has(['code', 'nameAr', 'nameEn']) },
            orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
            take,
          })
        ).map((r) => ({ id: r.id, code: r.code, label: r.nameAr }));
      case 'treasuries':
        return (await p.treasury.findMany({ where: { isActive: true, ...has(['code', 'name']) }, orderBy: { code: 'asc' }, take })).map(
          (r) => ({ id: r.id, code: r.code, label: r.name }),
        );
      case 'request-types':
        return (await p.requestType.findMany({ where: { isActive: true, ...has(['code', 'nameAr', 'nameEn']) }, orderBy: { code: 'asc' }, take })).map(
          (r) => ({ id: r.id, code: r.code, label: r.nameAr }),
        );
      default:
        throw new DomainError('NOT_FOUND', `Unknown lookup ${entity}`);
    }
  }
}
