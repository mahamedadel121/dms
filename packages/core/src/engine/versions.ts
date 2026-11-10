import { Prisma, type PrismaClient } from '@prisma/client';
import { checklistSchema, conditionSchema, type Condition } from '@dms/shared';
import type { Actor } from '../common';
import { audit, toJsonValue } from '../audit';
import { DomainError } from '../errors';
import { conditionUses, evaluateCondition } from './conditions';
import type { SimulateSample } from './types';

export interface StepSaveInput {
  key: string;
  stepType?: 'ROLE' | 'DYNAMIC_CATEGORY_ROLES';
  kind?: 'APPROVAL' | 'PAYMENT';
  nameAr: string;
  nameEn: string;
  roleId?: string | null;
  parallelGroup?: string | null;
  condition?: unknown;
  allowedActions?: string[];
  canEditAmounts?: boolean;
  canReclassify?: boolean;
  checklist?: unknown;
  slaHours?: number | null;
  showInSignatures?: boolean;
}

/** Validation rules of PLAN 5.1. Returns a list of problems (empty = publishable). */
export function validateSteps(
  steps: {
    key: string;
    stepType: string;
    kind: string;
    roleId: string | null;
    parallelGroup: string | null;
    condition: unknown;
  }[],
): string[] {
  const errors: string[] = [];
  if (steps.length < 1) errors.push('A workflow needs at least one step');
  const keys = new Set<string>();
  for (const s of steps) {
    if (keys.has(s.key)) errors.push(`Duplicate step key "${s.key}"`);
    keys.add(s.key);
    if (s.stepType === 'ROLE' && !s.roleId) errors.push(`Step "${s.key}" needs a role`);
    if (!conditionSchema.safeParse(s.condition).success) errors.push(`Step "${s.key}" has an invalid condition`);
    if (s.kind === 'PAYMENT' && s.stepType !== 'ROLE') errors.push(`Payment step "${s.key}" must be a ROLE step`);
  }
  // parallel groups contiguous
  const seen = new Set<string>();
  let prev: string | null = null;
  for (const s of steps) {
    if (s.parallelGroup && s.parallelGroup !== prev && seen.has(s.parallelGroup)) {
      errors.push(`Parallel group "${s.parallelGroup}" is not contiguous`);
    }
    if (s.parallelGroup) seen.add(s.parallelGroup);
    prev = s.parallelGroup;
  }
  const payments = steps.filter((s) => s.kind === 'PAYMENT');
  if (payments.length > 1) errors.push('At most one PAYMENT step is allowed');
  if (payments.length === 1) {
    const p = payments[0];
    if (steps[steps.length - 1] !== p) errors.push('The PAYMENT step must be last');
    if (p.parallelGroup) errors.push('The PAYMENT step cannot be in a parallel group');
  }
  return errors;
}

export async function createDraftVersion(
  prisma: PrismaClient,
  workflowId: string,
  basedOnVersionId?: string,
  actor?: Actor,
): Promise<{ id: string }> {
  return prisma.$transaction(async (tx) => {
    // serialize version creation per workflow
    await tx.$queryRaw`SELECT id FROM workflows WHERE id = ${workflowId} FOR UPDATE`;
    const wf = await tx.workflow.findUnique({ where: { id: workflowId } });
    if (!wf) throw new DomainError('NOT_FOUND', 'Workflow not found');
    const existingDraft = await tx.workflowVersion.findFirst({ where: { workflowId, status: 'DRAFT' } });
    if (existingDraft) throw new DomainError('CONFLICT', 'A draft version already exists', undefined, { draftId: existingDraft.id });
    const base = basedOnVersionId
      ? await tx.workflowVersion.findFirst({ where: { id: basedOnVersionId, workflowId }, include: { steps: true } })
      : ((await tx.workflowVersion.findFirst({ where: { workflowId, status: 'ACTIVE' }, include: { steps: true } })) ??
        (await tx.workflowVersion.findFirst({ where: { workflowId }, orderBy: { version: 'desc' }, include: { steps: true } })));
    if (basedOnVersionId && !base) throw new DomainError('NOT_FOUND', 'Base version not found');
    const max = await tx.workflowVersion.aggregate({ where: { workflowId }, _max: { version: true } });
    const draft = await tx.workflowVersion.create({
      data: {
        workflowId,
        version: (max._max.version ?? 0) + 1,
        status: 'DRAFT',
        createdById: actor?.userId ?? null,
        note: base ? `Based on v${base.version}` : null,
      },
    });
    if (base) {
      await tx.workflowStep.createMany({
        data: base.steps.map((s) => ({
          workflowVersionId: draft.id,
          key: s.key,
          sortOrder: s.sortOrder,
          stepType: s.stepType,
          kind: s.kind,
          nameAr: s.nameAr,
          nameEn: s.nameEn,
          roleId: s.roleId,
          parallelGroup: s.parallelGroup,
          condition: s.condition as Prisma.InputJsonValue,
          allowedActions: s.allowedActions,
          canEditAmounts: s.canEditAmounts,
          canReclassify: s.canReclassify,
          checklist: s.checklist as Prisma.InputJsonValue,
          slaHours: s.slaHours,
          showInSignatures: s.showInSignatures,
        })),
      });
    }
    await audit(tx, { actor: actor ?? { type: 'SYSTEM' }, action: 'workflow.version.create', entityType: 'WorkflowVersion', entityId: draft.id, meta: { workflowId, basedOn: base?.id } });
    return { id: draft.id };
  });
}

/** Replaces the steps of a DRAFT version (array order = sortOrder). */
export async function saveDraftVersion(
  prisma: PrismaClient,
  versionId: string,
  input: { note?: string | null; steps: unknown[] },
  actor?: Actor,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const v = await tx.workflowVersion.findUnique({ where: { id: versionId } });
    if (!v) throw new DomainError('NOT_FOUND', 'Version not found');
    if (v.status !== 'DRAFT') throw new DomainError('INVALID_STATE', 'Only DRAFT versions can be edited');
    const steps = input.steps as StepSaveInput[];
    const rows = steps.map((s, i) => {
      const cond = conditionSchema.safeParse(s.condition ?? { type: 'ALWAYS' });
      if (!cond.success) throw new DomainError('VALIDATION', `Step "${s.key}" has an invalid condition`, undefined, cond.error.issues);
      const cl = checklistSchema.safeParse(s.checklist ?? []);
      if (!cl.success) throw new DomainError('VALIDATION', `Step "${s.key}" has an invalid checklist`);
      return {
        workflowVersionId: versionId,
        key: s.key,
        sortOrder: (i + 1) * 10,
        stepType: s.stepType ?? 'ROLE',
        kind: s.kind ?? 'APPROVAL',
        nameAr: s.nameAr,
        nameEn: s.nameEn,
        roleId: s.roleId ?? null,
        parallelGroup: s.parallelGroup ?? null,
        condition: toJsonValue(cond.data) as Prisma.InputJsonValue,
        allowedActions: s.allowedActions ?? ['APPROVE', 'REQUEST_CORRECTION', 'SEND_BACK', 'REJECT'],
        canEditAmounts: s.canEditAmounts ?? false,
        canReclassify: s.canReclassify ?? false,
        checklist: toJsonValue(cl.data) as Prisma.InputJsonValue,
        slaHours: s.slaHours ?? null,
        showInSignatures: s.showInSignatures ?? true,
      };
    });
    const keys = new Set<string>();
    for (const r of rows) {
      if (keys.has(r.key)) throw new DomainError('VALIDATION', `Duplicate step key "${r.key}"`);
      keys.add(r.key);
    }
    await tx.workflowStep.deleteMany({ where: { workflowVersionId: versionId } });
    await tx.workflowStep.createMany({ data: rows });
    if (input.note !== undefined) await tx.workflowVersion.update({ where: { id: versionId }, data: { note: input.note } });
    await audit(tx, { actor: actor ?? { type: 'SYSTEM' }, action: 'workflow.version.save', entityType: 'WorkflowVersion', entityId: versionId, after: { steps: rows.map((r) => r.key) } });
  });
}

export async function deleteDraftVersion(prisma: PrismaClient, versionId: string, actor?: Actor): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const v = await tx.workflowVersion.findUnique({ where: { id: versionId } });
    if (!v) throw new DomainError('NOT_FOUND', 'Version not found');
    if (v.status !== 'DRAFT') throw new DomainError('INVALID_STATE', 'Only DRAFT versions can be deleted');
    await tx.workflowVersion.delete({ where: { id: versionId } });
    await audit(tx, { actor: actor ?? { type: 'SYSTEM' }, action: 'workflow.version.delete', entityType: 'WorkflowVersion', entityId: versionId });
  });
}

/** DRAFT -> ACTIVE; previous ACTIVE -> ARCHIVED, one transaction (PLAN 5.1). */
export async function publishWorkflowVersion(prisma: PrismaClient, versionId: string, actor?: Actor): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const v0 = await tx.workflowVersion.findUnique({ where: { id: versionId } });
    if (!v0) throw new DomainError('NOT_FOUND', 'Version not found');
    await tx.$queryRaw`SELECT id FROM workflows WHERE id = ${v0.workflowId} FOR UPDATE`;
    const v = await tx.workflowVersion.findUniqueOrThrow({ where: { id: versionId }, include: { steps: { orderBy: { sortOrder: 'asc' } } } });
    if (v.status !== 'DRAFT') throw new DomainError('INVALID_STATE', 'Only DRAFT versions can be published');
    const errors = validateSteps(v.steps);
    if (errors.length) throw new DomainError('VALIDATION', errors[0], undefined, errors);
    await tx.workflowVersion.updateMany({ where: { workflowId: v.workflowId, status: 'ACTIVE' }, data: { status: 'ARCHIVED' } });
    await tx.workflowVersion.update({
      where: { id: versionId },
      data: { status: 'ACTIVE', publishedAt: new Date(), publishedById: actor?.userId ?? null },
    });
    await audit(tx, { actor: actor ?? { type: 'SYSTEM' }, action: 'workflow.version.publish', entityType: 'WorkflowVersion', entityId: versionId, meta: { workflowId: v.workflowId, version: v.version } });
  });
}

/** Dry run: which steps apply for the given categories / total / header (no DB writes). */
export async function simulateWorkflow(
  db: import('../common').Db,
  versionId: string,
  sample: SimulateSample,
): Promise<{ stepKey: string; applies: boolean }[]> {
  const v = await db.workflowVersion.findUnique({
    where: { id: versionId },
    include: { steps: { orderBy: { sortOrder: 'asc' } }, workflow: { include: { requestType: true } } },
  });
  if (!v) throw new DomainError('NOT_FOUND', 'Version not found');
  const cats = await db.lineCategory.findMany({
    where: { id: { in: sample.categoryIds } },
    include: { approvalRoles: true },
  });
  const base = {
    totalAmount: sample.totalAmount ?? '0',
    lineCategoryCodes: [...new Set(cats.map((c) => c.code))],
    requiredRoleIds: [...new Set(cats.flatMap((c) => c.approvalRoles.map((r) => r.roleId)))],
    header: sample.header ?? {},
    department: { code: null as string | null },
    module: sample.module ?? {},
  };
  const covered = new Set(
    v.steps
      .filter((s) => s.stepType === 'ROLE' && s.roleId && conditionUses(conditionSchema.parse(s.condition), 'LINE_CATEGORY_REQUIRES_ROLE'))
      .map((s) => s.roleId as string),
  );
  const out: { stepKey: string; applies: boolean }[] = [];
  for (const s of v.steps) {
    const cond = conditionSchema.parse(s.condition) as Condition;
    if (s.stepType === 'ROLE') {
      out.push({ stepKey: s.key, applies: !!s.roleId && evaluateCondition(cond, { ...base, stepRoleId: s.roleId }) });
    } else {
      const roleIds = base.requiredRoleIds.filter((r) => !covered.has(r));
      if (roleIds.length === 0) out.push({ stepKey: s.key, applies: false });
      const roles = await db.role.findMany({ where: { id: { in: roleIds } } });
      for (const r of roles) {
        out.push({ stepKey: `${s.key}:${r.code}`, applies: evaluateCondition(cond, { ...base, stepRoleId: r.id }) });
      }
    }
  }
  return out;
}
