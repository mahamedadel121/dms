import { ALL_PERMISSION_CODES, type AuthUser, type EffectiveRole } from '@dms/shared';
import type { Db } from '../common';

export type { AuthUser, EffectiveRole };

/**
 * Own active roles + roles reachable through active (not revoked, startsAt <= at < endsAt)
 * delegations addressed to the user. A directly held role wins over the same role obtained
 * through delegation. roleId=null on a delegation means all of the delegator's roles.
 */
export async function getEffectiveRoles(db: Db, userId: string, at: Date = new Date()): Promise<EffectiveRole[]> {
  const own = await db.userRole.findMany({
    where: { userId, role: { isActive: true } },
    include: { role: true },
  });
  const result = new Map<string, EffectiveRole>();
  for (const ur of own) {
    result.set(ur.roleId, {
      roleId: ur.role.id,
      code: ur.role.code,
      nameAr: ur.role.nameAr,
      nameEn: ur.role.nameEn,
      scopeDepartmentId: ur.role.scopeDepartmentId,
      isSuperUser: ur.role.isSuperUser,
    });
  }

  const delegations = await db.delegation.findMany({
    where: {
      toUserId: userId,
      revokedAt: null,
      startsAt: { lte: at },
      endsAt: { gt: at },
      fromUser: { isActive: true },
    },
    orderBy: { createdAt: 'asc' },
  });
  for (const d of delegations) {
    const delegatorRoles = await db.userRole.findMany({
      where: { userId: d.fromUserId, role: { isActive: true }, ...(d.roleId ? { roleId: d.roleId } : {}) },
      include: { role: true },
    });
    for (const ur of delegatorRoles) {
      if (result.has(ur.roleId)) continue;
      result.set(ur.roleId, {
        roleId: ur.role.id,
        code: ur.role.code,
        nameAr: ur.role.nameAr,
        nameEn: ur.role.nameEn,
        scopeDepartmentId: ur.role.scopeDepartmentId,
        isSuperUser: ur.role.isSuperUser,
        viaDelegationId: d.id,
        onBehalfOfUserId: d.fromUserId,
      });
    }
  }
  return [...result.values()].sort((a, b) => a.code.localeCompare(b.code));
}

export async function loadAuthUser(db: Db, userId: string): Promise<AuthUser | null> {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || !user.isActive) return null;
  const roles = await getEffectiveRoles(db, userId);
  const isSuperUser = roles.some((r) => r.isSuperUser);
  let permissions: string[];
  if (isSuperUser) {
    const rows = await db.permission.findMany({ select: { code: true } });
    permissions = [...new Set([...ALL_PERMISSION_CODES, ...rows.map((r) => r.code)])];
  } else if (roles.length === 0) {
    permissions = [];
  } else {
    const grants = await db.rolePermission.findMany({
      where: { roleId: { in: roles.map((r) => r.roleId) } },
      select: { permissionCode: true },
    });
    permissions = [...new Set(grants.map((g) => g.permissionCode))];
  }
  permissions.sort();
  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    departmentId: user.departmentId,
    isSuperUser,
    permissions,
    roles,
  };
}

export function hasPermission(user: Pick<AuthUser, 'isSuperUser' | 'permissions'>, code: string): boolean {
  return user.isSuperUser || user.permissions.includes(code);
}
