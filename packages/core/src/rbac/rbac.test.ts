import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupTestDb } from '@dms/db/testing';
import type { PrismaClient } from '@prisma/client';
import { ALL_PERMISSION_CODES } from '@dms/shared';
import { getEffectiveRoles, loadAuthUser } from './index';

let prisma: PrismaClient;
let teardown: () => Promise<void>;

async function uid(username: string) {
  return (await prisma.user.findUniqueOrThrow({ where: { username } })).id;
}
async function rid(code: string) {
  return (await prisma.role.findUniqueOrThrow({ where: { code } })).id;
}

beforeAll(async () => {
  const t = await setupTestDb('wp0b-rbac');
  prisma = t.prisma;
  teardown = t.teardown;
});
afterAll(async () => {
  await teardown?.();
});

describe('rbac', () => {
  it('loads permissions of an own role', async () => {
    const u = await loadAuthUser(prisma, await uid('accountant1'));
    expect(u).not.toBeNull();
    expect(u!.isSuperUser).toBe(false);
    expect(u!.roles.map((r) => r.code)).toEqual(['ACCOUNTANT']);
    expect(u!.permissions).toContain('requests.edit_amounts');
    expect(u!.permissions).not.toContain('sap.retry');
  });

  it('chief accountant = accountant + extras', async () => {
    const a = await loadAuthUser(prisma, await uid('accountant1'));
    const c = await loadAuthUser(prisma, await uid('chief'));
    for (const p of a!.permissions) expect(c!.permissions).toContain(p);
    expect(c!.permissions).toEqual(expect.arrayContaining(['sap.retry', 'audit.view', 'masterdata.manage']));
  });

  it('super user gets every permission', async () => {
    const u = await loadAuthUser(prisma, await uid('admin'));
    expect(u!.isSuperUser).toBe(true);
    expect(u!.permissions).toEqual(expect.arrayContaining(ALL_PERMISSION_CODES));
  });

  it('returns null for unknown or inactive users', async () => {
    expect(await loadAuthUser(prisma, 'nope')).toBeNull();
    const id = await uid('treasury');
    await prisma.user.update({ where: { id }, data: { isActive: false } });
    expect(await loadAuthUser(prisma, id)).toBeNull();
    await prisma.user.update({ where: { id }, data: { isActive: true } });
  });

  it('delegation grants the delegator roles inside its window only, never after revoke', async () => {
    const from = await uid('chief');
    const to = await uid('accountant2');
    const now = new Date('2026-06-10T12:00:00Z');
    const d = await prisma.delegation.create({
      data: {
        fromUserId: from,
        toUserId: to,
        roleId: null,
        startsAt: new Date('2026-06-10T00:00:00Z'),
        endsAt: new Date('2026-06-12T00:00:00Z'),
        createdById: from,
      },
    });
    const during = await getEffectiveRoles(prisma, to, now);
    const viaChief = during.find((r) => r.code === 'CHIEF_ACCOUNTANT');
    expect(viaChief?.viaDelegationId).toBe(d.id);
    expect(viaChief?.onBehalfOfUserId).toBe(from);
    // own role stays direct
    expect(during.find((r) => r.code === 'ACCOUNTANT')?.viaDelegationId).toBeUndefined();

    expect((await getEffectiveRoles(prisma, to, new Date('2026-06-09T23:59:59Z'))).map((r) => r.code)).toEqual(['ACCOUNTANT']);
    expect((await getEffectiveRoles(prisma, to, new Date('2026-06-12T00:00:00Z'))).map((r) => r.code)).toEqual(['ACCOUNTANT']);

    await prisma.delegation.update({ where: { id: d.id }, data: { revokedAt: new Date('2026-06-11T00:00:00Z') } });
    expect((await getEffectiveRoles(prisma, to, now)).map((r) => r.code)).toEqual(['ACCOUNTANT']);
  });

  it('delegation of a single role only hands over that role', async () => {
    const from = await uid('shipping');
    const to = await uid('engineer');
    await prisma.delegation.create({
      data: {
        fromUserId: from,
        toUserId: to,
        roleId: await rid('SHIPPING_OFFICER'),
        startsAt: new Date(Date.now() - 3600_000),
        endsAt: new Date(Date.now() + 3600_000),
        createdById: from,
      },
    });
    const u = await loadAuthUser(prisma, to);
    expect(u!.roles.map((r) => r.code).sort()).toEqual(['MAINTENANCE_ENGINEER', 'SHIPPING_OFFICER']);
    expect(u!.permissions).toContain('vehicle_changes.decide');
  });

  it('a delegation for a role the delegator does not hold grants nothing', async () => {
    const from = await uid('supervisor');
    const to = await uid('gm');
    await prisma.delegation.create({
      data: {
        fromUserId: from,
        toUserId: to,
        roleId: await rid('TREASURY'),
        startsAt: new Date(Date.now() - 3600_000),
        endsAt: new Date(Date.now() + 3600_000),
        createdById: from,
      },
    });
    const roles = await getEffectiveRoles(prisma, to);
    expect(roles.map((r) => r.code)).toEqual(['GENERAL_MANAGER']);
  });

  it('inactive roles are ignored', async () => {
    const id = await rid('TREASURY');
    await prisma.role.update({ where: { id }, data: { isActive: false } });
    expect(await getEffectiveRoles(prisma, await uid('treasury'))).toEqual([]);
    await prisma.role.update({ where: { id }, data: { isActive: true } });
  });
});
