import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { audit } from '@dms/core/audit';
import { DomainError } from '@dms/core/errors';
import { hasPermission, type AuthUser } from '@dms/core/rbac';
import { delegationCreateSchema, type DelegationCreateInput, type DelegationRow } from '@dms/shared';
import { actorFromReq } from '../common/actor';
import { AuthOnly, CurrentUser } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../prisma/prisma.service';

type Req_ = Parameters<typeof actorFromReq>[0];
const include = { fromUser: true, toUser: true, role: true } satisfies Prisma.DelegationInclude;
type Full = Prisma.DelegationGetPayload<{ include: typeof include }>;

function toRow(d: Full): DelegationRow {
  const now = new Date();
  const status = d.revokedAt ? 'REVOKED' : d.endsAt <= now ? 'EXPIRED' : d.startsAt > now ? 'UPCOMING' : 'ACTIVE';
  return {
    id: d.id,
    fromUserId: d.fromUserId,
    fromUserName: d.fromUser.fullName,
    toUserId: d.toUserId,
    toUserName: d.toUser.fullName,
    roleId: d.roleId,
    roleName: d.role?.nameAr ?? null,
    startsAt: d.startsAt.toISOString(),
    endsAt: d.endsAt.toISOString(),
    reason: d.reason,
    revokedAt: d.revokedAt?.toISOString() ?? null,
    status,
    createdAt: d.createdAt.toISOString(),
  };
}

@Controller('delegations')
export class DelegationsController {
  constructor(private readonly prisma: PrismaService) {}

  /** `mine=1` (or lacking delegations.manage_all) restricts to delegations the caller gave or received. */
  @AuthOnly()
  @Get()
  async list(@CurrentUser() u: AuthUser, @Query('mine') mine?: string): Promise<DelegationRow[]> {
    const onlyMine = mine === '1' || mine === 'true' || !hasPermission(u, 'delegations.manage_all');
    const rows = await this.prisma.delegation.findMany({
      where: onlyMine ? { OR: [{ fromUserId: u.id }, { toUserId: u.id }] } : {},
      include,
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    return rows.map(toRow);
  }

  @AuthOnly()
  @Post()
  async create(
    @CurrentUser() u: AuthUser,
    @Body(new ZodPipe(delegationCreateSchema)) b: DelegationCreateInput,
    @Req() req: Req_,
  ): Promise<DelegationRow> {
    const fromUserId = b.fromUserId ?? u.id;
    if (fromUserId !== u.id && !hasPermission(u, 'delegations.manage_all')) {
      throw new DomainError('FORBIDDEN', 'Only delegations.manage_all may delegate on behalf of another user');
    }
    if (fromUserId === b.toUserId) throw new DomainError('VALIDATION', 'Cannot delegate to yourself');
    const [from, to] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: fromUserId } }),
      this.prisma.user.findUnique({ where: { id: b.toUserId } }),
    ]);
    if (!from) throw new DomainError('NOT_FOUND', 'Delegating user not found');
    if (!to || !to.isActive) throw new DomainError('VALIDATION', 'Target user not found or inactive');
    if (b.roleId) {
      const has = await this.prisma.userRole.findUnique({ where: { userId_roleId: { userId: fromUserId, roleId: b.roleId } } });
      if (!has) throw new DomainError('VALIDATION', 'The delegating user does not hold that role');
    } else if ((await this.prisma.userRole.count({ where: { userId: fromUserId } })) === 0) {
      throw new DomainError('VALIDATION', 'The delegating user holds no roles');
    }
    const row = await this.prisma.$transaction(async (tx) => {
      const d = await tx.delegation.create({
        data: {
          fromUserId,
          toUserId: b.toUserId,
          roleId: b.roleId ?? null,
          startsAt: b.startsAt,
          endsAt: b.endsAt,
          reason: b.reason ?? null,
          createdById: u.id,
        },
        include,
      });
      await audit(tx, {
        actor: actorFromReq(req),
        action: 'delegation.create',
        entityType: 'Delegation',
        entityId: d.id,
        after: { fromUserId, toUserId: b.toUserId, roleId: b.roleId ?? null, startsAt: b.startsAt, endsAt: b.endsAt },
      });
      return d;
    });
    return toRow(row);
  }

  @AuthOnly()
  @Post(':id/revoke')
  @HttpCode(200)
  async revoke(@CurrentUser() u: AuthUser, @Param('id') id: string, @Req() req: Req_): Promise<DelegationRow> {
    const d = await this.prisma.delegation.findUnique({ where: { id } });
    if (!d) throw new DomainError('NOT_FOUND', 'Delegation not found');
    if (d.fromUserId !== u.id && d.createdById !== u.id && !hasPermission(u, 'delegations.manage_all')) {
      throw new DomainError('FORBIDDEN', 'Not allowed to revoke this delegation');
    }
    if (d.revokedAt) throw new DomainError('INVALID_STATE', 'Already revoked');
    const upd = await this.prisma.delegation.update({
      where: { id },
      data: { revokedAt: new Date(), revokedById: u.id },
      include,
    });
    await audit(this.prisma, {
      actor: actorFromReq(req),
      action: 'delegation.revoke',
      entityType: 'Delegation',
      entityId: id,
      before: { revokedAt: null },
      after: { revokedAt: upd.revokedAt },
    });
    return toRow(upd);
  }
}
