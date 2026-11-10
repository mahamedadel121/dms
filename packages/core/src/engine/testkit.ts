// Test helpers for the engine tests (not exported from index).
import { randomBytes } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { setupTestDb } from '@dms/db/testing';
import type { AuthUser } from '@dms/shared';
import { registerExpenseModule } from '../expense';
import { loadAuthUser } from '../rbac';
import { approveStep, submitRequest } from './index';
import type { Actor } from '../common';

export interface Env {
  prisma: PrismaClient;
  teardown(): Promise<void>;
}

export async function createEnv(tag: string): Promise<Env> {
  const t = await setupTestDb(tag);
  registerExpenseModule();
  return { prisma: t.prisma, teardown: t.teardown };
}

export async function userOf(prisma: PrismaClient, username: string): Promise<AuthUser> {
  const u = await prisma.user.findUniqueOrThrow({ where: { username } });
  return (await loadAuthUser(prisma, u.id))!;
}
export const actorOf = (u: AuthUser): Actor => ({ type: 'USER', userId: u.id, label: u.username });

export async function driver(prisma: PrismaClient, code = 'DRV001') {
  return prisma.submitter.findUniqueOrThrow({ where: { code } });
}

export async function addAttachment(prisma: PrismaClient, submitterId: string, mimeType = 'image/jpeg') {
  const key = `attachments/2026/01/${randomBytes(8).toString('hex')}.jpg`;
  return prisma.attachment.create({
    data: {
      storageKey: key,
      mimeType,
      sizeBytes: 100,
      sha256: randomBytes(32).toString('hex'),
      uploadedBySubmitterId: submitterId,
    },
  });
}

export interface LineSpec {
  cat: string;
  amount: string;
  extra?: Record<string, string>;
  photos?: number;
}

export async function submitExpense(
  prisma: PrismaClient,
  o: { lines: LineSpec[]; driverCode?: string; odometer?: number; clientKey?: string; vehicleId?: string },
) {
  const d = await driver(prisma, o.driverCode);
  const lines = [];
  for (const l of o.lines) {
    const cat = await prisma.lineCategory.findFirstOrThrow({ where: { code: l.cat, requestType: { code: 'DRIVER_EXPENSE' } } });
    const ids: string[] = [];
    for (let i = 0; i < (l.photos ?? 1); i++) ids.push((await addAttachment(prisma, d.id)).id);
    lines.push({ categoryId: cat.id, amount: l.amount, extraValues: l.extra, attachmentIds: ids });
  }
  return submitRequest(
    prisma,
    {
      requestTypeCode: 'DRIVER_EXPENSE',
      channel: 'TELEGRAM',
      submitterId: d.id,
      clientKey: o.clientKey,
      headerValues: { odometer: o.odometer ?? 1000, ...(o.vehicleId ? { vehicleId: o.vehicleId } : {}) },
      lines,
    },
    { type: 'SUBMITTER', submitterId: d.id },
  );
}

export async function steps(prisma: PrismaClient, requestId: string) {
  const rows = await prisma.requestStepInstance.findMany({ where: { requestId }, orderBy: [{ stageIndex: 'asc' }, { sortOrder: 'asc' }] });
  return Object.fromEntries(rows.map((r) => [r.stepKey, r.status])) as Record<string, string>;
}

export async function instanceOf(prisma: PrismaClient, requestId: string, stepKey: string) {
  return prisma.requestStepInstance.findUniqueOrThrow({ where: { requestId_stepKey: { requestId, stepKey } } });
}

/** Approves `stepKey` as `username` (ticking the supervisor checklist). */
export async function approveAs(prisma: PrismaClient, requestId: string, stepKey: string, username: string, actionData?: Record<string, unknown>) {
  const user = await userOf(prisma, username);
  const inst = await instanceOf(prisma, requestId, stepKey);
  await approveStep(prisma, {
    requestId,
    stepInstanceId: inst.id,
    user,
    checklist: { receipts_match: true },
    actionData,
    actor: actorOf(user),
  });
}

export const FULL_PATH: [string, string][] = [
  ['supervisor', 'supervisor'],
  ['campaign_manager', 'manager'],
  ['accountant', 'accountant1'],
  ['chief_accountant', 'chief'],
  ['general_manager', 'gm'],
  ['treasury', 'treasury'],
];
