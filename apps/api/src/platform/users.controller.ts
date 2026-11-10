import { Body, Controller, Get, HttpCode, Param, Patch, Post, Put, Query, Req } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { audit } from '@dms/core/audit';
import { DomainError } from '@dms/core/errors';
import { hasPermission, type AuthUser } from '@dms/core/rbac';
import { buildLinkInfo } from '@dms/core/telegram';
import {
  platformPageQuerySchema,
  resetPasswordSchema,
  userCreateSchema,
  userRolesSchema,
  userUpdateSchema,
  type Paged,
  type PageQuery,
  type TelegramLinkDto,
  type ResetPasswordInput,
  type ResetPasswordResult,
  type UserCreateInput,
  type UserRolesInput,
  type UserRow,
  type UserUpdateInput,
} from '@dms/shared';
import { actorFromReq } from '../common/actor';
import { AuthOnly, CurrentUser, RequirePermission } from '../common/decorators';
import { iso, orderByOf, pageArgs, paged } from '../common/paging';
import { generatePassword, hashPassword } from '../common/password';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../prisma/prisma.service';

type Req_ = Parameters<typeof actorFromReq>[0];

const include = {
  department: true,
  roles: { include: { role: true } },
  signatures: { where: { isActive: true }, select: { id: true } },
} satisfies Prisma.UserInclude;
type UserFull = Prisma.UserGetPayload<{ include: typeof include }>;

function toRow(u: UserFull): UserRow {
  return {
    id: u.id,
    username: u.username,
    fullName: u.fullName,
    fullNameEn: u.fullNameEn,
    phone: u.phone,
    email: u.email,
    departmentId: u.departmentId,
    departmentName: u.department?.nameAr ?? null,
    locale: u.locale,
    isActive: u.isActive,
    mustChangePassword: u.mustChangePassword,
    lockedUntil: iso(u.lockedUntil),
    lastLoginAt: iso(u.lastLoginAt),
    telegramLinked: u.telegramUserId !== null,
    roleIds: u.roles.map((r) => r.roleId),
    roles: u.roles.map((r) => ({ id: r.role.id, code: r.role.code, nameAr: r.role.nameAr, nameEn: r.role.nameEn })),
    hasSignature: u.signatures.length > 0,
    createdAt: u.createdAt.toISOString(),
  };
}

const snapshot = (u: UserFull) => ({
  username: u.username,
  fullName: u.fullName,
  fullNameEn: u.fullNameEn,
  phone: u.phone,
  email: u.email,
  departmentId: u.departmentId,
  locale: u.locale,
  isActive: u.isActive,
  mustChangePassword: u.mustChangePassword,
  roleIds: u.roles.map((r) => r.roleId).sort(),
});

@Controller('users')
export class UsersController {
  constructor(private readonly prisma: PrismaService) {}

  private async load(id: string): Promise<UserFull> {
    const u = await this.prisma.user.findUnique({ where: { id }, include });
    if (!u) throw new DomainError('NOT_FOUND', 'User not found');
    return u;
  }

  @RequirePermission('users.view')
  @Get()
  async list(@Query(new ZodPipe(platformPageQuerySchema)) q: PageQuery): Promise<Paged<UserRow>> {
    const { skip, take, page, pageSize } = pageArgs(q);
    const where: Prisma.UserWhereInput = q.q
      ? {
          OR: [
            { username: { contains: q.q, mode: 'insensitive' } },
            { fullName: { contains: q.q, mode: 'insensitive' } },
            { email: { contains: q.q, mode: 'insensitive' } },
          ],
        }
      : {};
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        include,
        skip,
        take,
        orderBy: orderByOf(q.sort, ['username', 'fullName', 'createdAt', 'lastLoginAt'], { username: 'asc' }),
      }),
      this.prisma.user.count({ where }),
    ]);
    return paged(items.map(toRow), total, page, pageSize);
  }

  @RequirePermission('users.view')
  @Get(':id')
  async get(@Param('id') id: string): Promise<UserRow> {
    return toRow(await this.load(id));
  }

  @RequirePermission('users.manage')
  @Post()
  async create(@Body(new ZodPipe(userCreateSchema)) b: UserCreateInput, @Req() req: Req_): Promise<UserRow> {
    if (await this.prisma.user.findUnique({ where: { username: b.username } })) {
      throw new DomainError('CONFLICT', 'Username already exists');
    }
    if (b.roleIds.length) {
      const n = await this.prisma.role.count({ where: { id: { in: b.roleIds } } });
      if (n !== new Set(b.roleIds).size) throw new DomainError('VALIDATION', 'Unknown role id');
    }
    const actor = actorFromReq(req);
    const id = await this.prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          username: b.username,
          passwordHash: await hashPassword(b.password),
          fullName: b.fullName,
          fullNameEn: b.fullNameEn ?? null,
          phone: b.phone ?? null,
          email: b.email ?? null,
          departmentId: b.departmentId ?? null,
          locale: b.locale,
          mustChangePassword: b.mustChangePassword,
          roles: { create: [...new Set(b.roleIds)].map((roleId) => ({ roleId, assignedById: actor.userId ?? null })) },
        },
        include,
      });
      await audit(tx, { actor, action: 'user.create', entityType: 'User', entityId: u.id, after: snapshot(u) });
      return u.id;
    });
    return toRow(await this.load(id));
  }

  @RequirePermission('users.manage')
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body(new ZodPipe(userUpdateSchema)) b: UserUpdateInput,
    @CurrentUser() me: AuthUser,
    @Req() req: Req_,
  ): Promise<UserRow> {
    const before = await this.load(id);
    if (b.isActive === false && id === me.id) throw new DomainError('INVALID_STATE', 'You cannot deactivate yourself');
    const data: Prisma.UserUpdateInput = {};
    if (b.fullName !== undefined) data.fullName = b.fullName;
    if (b.fullNameEn !== undefined) data.fullNameEn = b.fullNameEn;
    if (b.phone !== undefined) data.phone = b.phone;
    if (b.email !== undefined) data.email = b.email;
    if (b.departmentId !== undefined) {
      data.department = b.departmentId ? { connect: { id: b.departmentId } } : { disconnect: true };
    }
    if (b.locale !== undefined) data.locale = b.locale;
    if (b.isActive !== undefined) data.isActive = b.isActive;
    if (b.mustChangePassword !== undefined) data.mustChangePassword = b.mustChangePassword;
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data });
      if (b.isActive === false) {
        await tx.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      }
      const after = await tx.user.findUniqueOrThrow({ where: { id }, include });
      await audit(tx, {
        actor: actorFromReq(req),
        action: 'user.update',
        entityType: 'User',
        entityId: id,
        before: snapshot(before),
        after: snapshot(after),
      });
    });
    return toRow(await this.load(id));
  }

  @RequirePermission('users.manage')
  @Put(':id/roles')
  async setRoles(
    @Param('id') id: string,
    @Body(new ZodPipe(userRolesSchema)) b: UserRolesInput,
    @Req() req: Req_,
  ): Promise<UserRow> {
    const before = await this.load(id);
    const ids = [...new Set(b.roleIds)];
    const n = await this.prisma.role.count({ where: { id: { in: ids } } });
    if (n !== ids.length) throw new DomainError('VALIDATION', 'Unknown role id');
    const actor = actorFromReq(req);
    await this.prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId: id, roleId: { notIn: ids } } });
      const have = new Set((await tx.userRole.findMany({ where: { userId: id } })).map((r) => r.roleId));
      const add = ids.filter((r) => !have.has(r));
      if (add.length) {
        await tx.userRole.createMany({ data: add.map((roleId) => ({ userId: id, roleId, assignedById: actor.userId ?? null })) });
      }
      await audit(tx, {
        actor,
        action: 'user.roles.update',
        entityType: 'User',
        entityId: id,
        before: { roleIds: before.roles.map((r) => r.roleId).sort() },
        after: { roleIds: [...ids].sort() },
      });
    });
    return toRow(await this.load(id));
  }

  @RequirePermission('users.manage')
  @Post(':id/reset-password')
  @HttpCode(200)
  async resetPassword(
    @Param('id') id: string,
    @Body(new ZodPipe(resetPasswordSchema)) b: ResetPasswordInput,
    @Req() req: Req_,
  ): Promise<ResetPasswordResult> {
    await this.load(id);
    const pw = b.newPassword ?? generatePassword();
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: { passwordHash: await hashPassword(pw), mustChangePassword: b.mustChangePassword, failedLoginCount: 0, lockedUntil: null },
      });
      await tx.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      await audit(tx, { actor: actorFromReq(req), action: 'user.reset_password', entityType: 'User', entityId: id });
    });
    return { temporaryPassword: b.newPassword ? null : pw };
  }

  @RequirePermission('users.manage')
  @Post(':id/revoke-sessions')
  @HttpCode(200)
  async revokeSessions(@Param('id') id: string, @Req() req: Req_) {
    await this.load(id);
    const r = await this.prisma.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    await audit(this.prisma, {
      actor: actorFromReq(req),
      action: 'user.revoke_sessions',
      entityType: 'User',
      entityId: id,
      meta: { revoked: r.count },
    });
    return { revoked: r.count };
  }

  /** Self or `users.manage`. */
  private async authorizeLink(id: string, me: AuthUser): Promise<void> {
    if (id !== me.id && !hasPermission(me, 'users.manage')) throw new DomainError('FORBIDDEN', 'Missing permission');
  }

  @AuthOnly()
  @Post(':id/telegram-link')
  @HttpCode(200)
  async issueTelegramLink(@Param('id') id: string, @CurrentUser() me: AuthUser, @Req() req: Req_): Promise<TelegramLinkDto> {
    await this.authorizeLink(id, me);
    const u = await this.prisma.user.findUnique({ where: { id } });
    if (!u || !u.isActive) throw new DomainError('NOT_FOUND', 'User not found');
    if (u.telegramUserId !== null) throw new DomainError('INVALID_STATE', 'A Telegram account is already linked');
    const info = buildLinkInfo({ kind: 'u', id });
    await audit(this.prisma, { actor: actorFromReq(req), action: 'user.telegram_link_issued', entityType: 'User', entityId: id });
    return info;
  }

  @AuthOnly()
  @Post(':id/telegram-unlink')
  @HttpCode(200)
  async telegramUnlink(@Param('id') id: string, @CurrentUser() me: AuthUser, @Req() req: Req_) {
    await this.authorizeLink(id, me);
    const u = await this.prisma.user.findUnique({ where: { id } });
    if (!u) throw new DomainError('NOT_FOUND', 'User not found');
    if (u.telegramUserId === null) throw new DomainError('INVALID_STATE', 'No Telegram account is linked');
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { telegramUserId: null, telegramChatId: null } });
      await audit(tx, {
        actor: actorFromReq(req),
        action: 'user.telegram_unlink',
        entityType: 'User',
        entityId: id,
        before: { telegramUserId: u.telegramUserId?.toString() },
        after: { telegramUserId: null },
      });
    });
    return { ok: true };
  }
}
