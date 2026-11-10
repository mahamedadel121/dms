import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupTestDb } from '@dms/db/testing';
import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { audit } from './index';
import { getSetting, setSetting, getSettings } from '../config';
import { DomainError } from '../errors';

let prisma: PrismaClient;
let teardown: () => Promise<void>;

beforeAll(async () => {
  const t = await setupTestDb('wp0b-audit');
  prisma = t.prisma;
  teardown = t.teardown;
});
afterAll(async () => {
  await teardown?.();
});

describe('audit', () => {
  it('writes before/after/meta and actor info', async () => {
    const admin = await prisma.user.findUniqueOrThrow({ where: { username: 'admin' } });
    await audit(prisma, {
      actor: { type: 'USER', userId: admin.id, label: admin.fullName, ip: '10.0.0.1', userAgent: 'vitest' },
      action: 'role.permissions.update',
      entityType: 'Role',
      entityId: 'r1',
      before: { codes: ['a'] },
      after: { codes: ['a', 'b'], when: new Date('2026-01-01T00:00:00Z'), amount: new Prisma.Decimal('10.50'), big: 5n },
      meta: { reason: 'test' },
    });
    const row = await prisma.auditLog.findFirstOrThrow({ where: { entityId: 'r1' } });
    expect(row).toMatchObject({
      actorType: 'USER',
      actorUserId: admin.id,
      actorLabel: admin.fullName,
      action: 'role.permissions.update',
      entityType: 'Role',
      ip: '10.0.0.1',
      userAgent: 'vitest',
    });
    expect(row.before).toEqual({ codes: ['a'] });
    expect(row.after).toEqual({ codes: ['a', 'b'], when: '2026-01-01T00:00:00.000Z', amount: '10.5', big: '5' });
    expect(row.meta).toEqual({ reason: 'test' });
  });

  it('SYSTEM and SUBMITTER actors', async () => {
    await audit(prisma, { actor: { type: 'SYSTEM' }, action: 'job.run', entityType: 'Job' });
    const sys = await prisma.auditLog.findFirstOrThrow({ where: { action: 'job.run' } });
    expect(sys.actorType).toBe('SYSTEM');
    expect(sys.actorLabel).toBe('system');
    expect(sys.before).toBeNull();
    await audit(prisma, { actor: { type: 'SUBMITTER', submitterId: 's1', label: 'Driver' }, action: 'bot.link_refused', entityType: 'Submitter' });
    const sub = await prisma.auditLog.findFirstOrThrow({ where: { action: 'bot.link_refused' } });
    expect(sub.actorType).toBe('SUBMITTER');
    expect(sub.actorUserId).toBeNull();
  });

  it('participates in the caller transaction', async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await audit(tx, { actor: { type: 'SYSTEM' }, action: 'tx.rolledback', entityType: 'X' });
        throw new Error('x');
      }),
    ).rejects.toThrow();
    expect(await prisma.auditLog.count({ where: { action: 'tx.rolledback' } })).toBe(0);
  });
});

describe('settings', () => {
  it('returns seeded values and defaults', async () => {
    expect(await getSetting(prisma, 'workflow.lockTimeoutMinutes')).toBe(15);
    expect((await getSetting(prisma, 'sap.config')).companyCode).toBe('1000');
    await prisma.setting.delete({ where: { key: 'media.maxFileSizeMb' } });
    expect(await getSetting(prisma, 'media.maxFileSizeMb')).toBe(15);
  });
  it('setSetting persists and validates', async () => {
    await setSetting(prisma, 'bot.draftExpiryHours', 48);
    expect(await getSetting(prisma, 'bot.draftExpiryHours')).toBe(48);
    expect((await getSettings(prisma))['bot.draftExpiryHours']).toBe(48);
    await expect(setSetting(prisma, 'bot.draftExpiryHours', 'x' as never)).rejects.toBeInstanceOf(DomainError);
  });
  it('merges object settings over defaults', async () => {
    await prisma.setting.update({ where: { key: 'sap.config' }, data: { value: { companyCode: '2000' } } });
    const c = await getSetting(prisma, 'sap.config');
    expect(c.companyCode).toBe('2000');
    expect(c.documentType).toBe('SA');
  });
});
