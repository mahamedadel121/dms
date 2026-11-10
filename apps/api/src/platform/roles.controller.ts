import { Body, Controller, Get, Param, Patch, Post, Put, Req } from '@nestjs/common';
import { audit } from '@dms/core/audit';
import { DomainError } from '@dms/core/errors';
import {
  roleCreateSchema,
  rolePermissionsSchema,
  roleUpdateSchema,
  type PermissionMatrix,
  type RoleCreateInput,
  type RolePermissionsInput,
  type RoleRow,
  type RoleUpdateInput,
} from '@dms/shared';
import { actorFromReq } from '../common/actor';
import { RequirePermission } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../prisma/prisma.service';

type Req_ = Parameters<typeof actorFromReq>[0];

@Controller('roles')
export class RolesController {
  constructor(private readonly prisma: PrismaService) {}

  private async rows(): Promise<RoleRow[]> {
    const roles = await this.prisma.role.findMany({
      orderBy: [{ isSystem: 'desc' }, { code: 'asc' }],
      include: { _count: { select: { users: true } } },
    });
    return roles.map((r) => ({
      id: r.id,
      code: r.code,
      nameAr: r.nameAr,
      nameEn: r.nameEn,
      description: r.description,
      scopeDepartmentId: r.scopeDepartmentId,
      isSuperUser: r.isSuperUser,
      isSystem: r.isSystem,
      isActive: r.isActive,
      userCount: r._count.users,
    }));
  }

  private async one(id: string): Promise<RoleRow> {
    const r = (await this.rows()).find((x) => x.id === id);
    if (!r) throw new DomainError('NOT_FOUND', 'Role not found');
    return r;
  }

  private async assertCodes(codes: string[]): Promise<string[]> {
    const uniq = [...new Set(codes)];
    const n = await this.prisma.permission.count({ where: { code: { in: uniq } } });
    if (n !== uniq.length) throw new DomainError('VALIDATION', 'Unknown permission code');
    return uniq;
  }

  @RequirePermission('users.view')
  @Get()
  list(): Promise<RoleRow[]> {
    return this.rows();
  }

  // declared before ':id' so "matrix" is not captured as an id
  @RequirePermission('roles.manage')
  @Get('matrix')
  async matrix(): Promise<PermissionMatrix> {
    const [roles, permissions, grants] = await Promise.all([
      this.rows(),
      this.prisma.permission.findMany({ orderBy: [{ groupKey: 'asc' }, { sortOrder: 'asc' }, { code: 'asc' }] }),
      this.prisma.rolePermission.findMany(),
    ]);
    const map: Record<string, string[]> = {};
    for (const r of roles) map[r.id] = [];
    for (const g of grants) (map[g.roleId] ??= []).push(g.permissionCode);
    for (const k of Object.keys(map)) map[k]!.sort();
    return { roles, permissions, grants: map };
  }

  @RequirePermission('users.view')
  @Get(':id')
  get(@Param('id') id: string): Promise<RoleRow> {
    return this.one(id);
  }

  @RequirePermission('roles.manage')
  @Post()
  async create(@Body(new ZodPipe(roleCreateSchema)) b: RoleCreateInput, @Req() req: Req_): Promise<RoleRow> {
    if (await this.prisma.role.findUnique({ where: { code: b.code } })) throw new DomainError('CONFLICT', 'Role code already exists');
    const codes = await this.assertCodes(b.permissionCodes);
    const id = await this.prisma.$transaction(async (tx) => {
      const r = await tx.role.create({
        data: {
          code: b.code,
          nameAr: b.nameAr,
          nameEn: b.nameEn,
          description: b.description ?? null,
          scopeDepartmentId: b.scopeDepartmentId ?? null,
          permissions: { create: codes.map((permissionCode) => ({ permissionCode })) },
        },
      });
      await audit(tx, {
        actor: actorFromReq(req),
        action: 'role.create',
        entityType: 'Role',
        entityId: r.id,
        after: { code: r.code, nameAr: r.nameAr, nameEn: r.nameEn, permissions: codes.sort() },
      });
      return r.id;
    });
    return this.one(id);
  }

  @RequirePermission('roles.manage')
  @Patch(':id')
  async update(@Param('id') id: string, @Body(new ZodPipe(roleUpdateSchema)) b: RoleUpdateInput, @Req() req: Req_): Promise<RoleRow> {
    const before = await this.prisma.role.findUnique({ where: { id } });
    if (!before) throw new DomainError('NOT_FOUND', 'Role not found');
    if (b.isActive === false && before.isSuperUser) throw new DomainError('INVALID_STATE', 'The super user role cannot be deactivated');
    const after = await this.prisma.role.update({
      where: { id },
      data: {
        nameAr: b.nameAr,
        nameEn: b.nameEn,
        description: b.description,
        scopeDepartmentId: b.scopeDepartmentId,
        isActive: b.isActive,
      },
    });
    const pick = (r: typeof before) => ({
      nameAr: r.nameAr,
      nameEn: r.nameEn,
      description: r.description,
      scopeDepartmentId: r.scopeDepartmentId,
      isActive: r.isActive,
    });
    await audit(this.prisma, {
      actor: actorFromReq(req),
      action: 'role.update',
      entityType: 'Role',
      entityId: id,
      before: pick(before),
      after: pick(after),
    });
    return this.one(id);
  }

  @RequirePermission('roles.manage')
  @Put(':id/permissions')
  async setPermissions(
    @Param('id') id: string,
    @Body(new ZodPipe(rolePermissionsSchema)) b: RolePermissionsInput,
    @Req() req: Req_,
  ): Promise<RoleRow> {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw new DomainError('NOT_FOUND', 'Role not found');
    if (role.isSuperUser) throw new DomainError('INVALID_STATE', 'The super user role implicitly holds every permission');
    const codes = await this.assertCodes(b.codes);
    await this.prisma.$transaction(async (tx) => {
      const before = (await tx.rolePermission.findMany({ where: { roleId: id } })).map((g) => g.permissionCode).sort();
      await tx.rolePermission.deleteMany({ where: { roleId: id } });
      if (codes.length) await tx.rolePermission.createMany({ data: codes.map((permissionCode) => ({ roleId: id, permissionCode })) });
      await audit(tx, {
        actor: actorFromReq(req),
        action: 'role.permissions.update',
        entityType: 'Role',
        entityId: id,
        before: { codes: before },
        after: { codes: [...codes].sort() },
      });
    });
    return this.one(id);
  }
}
