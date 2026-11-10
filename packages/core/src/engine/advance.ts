import type { Request, RequestStepInstance, WorkflowStep } from '@prisma/client';
import type { Actor, Db } from '../common';
import { notifyRole, notifySubmitter, submitterMessages, userMessages } from '../notifications';
import { evaluateCondition, parseCondition, conditionUses } from './conditions';
import { addEvent, loadFactsBase, slaDue, touchRequest, type FactsBase } from './helpers';
import { getModule } from './registry';

/** stageIndex per step id: a stage = maximal run of consecutive steps sharing a non-null parallelGroup. */
export function computeStages(steps: Pick<WorkflowStep, 'id' | 'parallelGroup' | 'sortOrder'>[]): Map<string, number> {
  const sorted = [...steps].sort((a, b) => a.sortOrder - b.sortOrder);
  const out = new Map<string, number>();
  let stage = -1;
  let prevGroup: string | null = null;
  for (const s of sorted) {
    if (s.parallelGroup === null || s.parallelGroup !== prevGroup) stage += 1;
    out.set(s.id, stage);
    prevGroup = s.parallelGroup;
  }
  return out;
}

function appliesFor(step: WorkflowStep, roleId: string, base: FactsBase): boolean {
  const cond = parseCondition(step.condition);
  let ok = evaluateCondition(cond, { ...base, stepRoleId: roleId });
  if (step.stepType === 'DYNAMIC_CATEGORY_ROLES') ok = ok && base.requiredRoleIds.includes(roleId);
  return ok;
}

/** Role ids required by line categories that no explicit LINE_CATEGORY_REQUIRES_ROLE step covers. */
function uncoveredRoleIds(steps: WorkflowStep[], base: FactsBase): string[] {
  const covered = new Set(
    steps
      .filter((s) => s.stepType === 'ROLE' && s.roleId && conditionUses(parseCondition(s.condition), 'LINE_CATEGORY_REQUIRES_ROLE'))
      .map((s) => s.roleId as string),
  );
  return base.requiredRoleIds.filter((r) => !covered.has(r));
}

/** Creates the step instances of a freshly submitted request and marks non-applicable ones. */
export async function instantiateSteps(tx: Db, req: Request, actor: Actor): Promise<void> {
  const steps = await tx.workflowStep.findMany({
    where: { workflowVersionId: req.workflowVersionId },
    orderBy: { sortOrder: 'asc' },
    include: { role: true },
  });
  const stages = computeStages(steps);
  const base = await loadFactsBase(tx, req.id);
  const uncovered = uncoveredRoleIds(steps, base);
  const created: { inst: RequestStepInstance; step: WorkflowStep }[] = [];
  for (const step of steps) {
    if (step.stepType === 'ROLE') {
      if (!step.role) continue;
      const inst = await tx.requestStepInstance.create({
        data: {
          requestId: req.id,
          workflowStepId: step.id,
          stepKey: step.key,
          stageIndex: stages.get(step.id)!,
          sortOrder: step.sortOrder,
          parallelGroup: step.parallelGroup,
          kind: step.kind,
          nameAr: step.nameAr,
          nameEn: step.nameEn,
          roleId: step.role.id,
          roleNameAr: step.role.nameAr,
          roleNameEn: step.role.nameEn,
        },
      });
      created.push({ inst, step });
    } else {
      for (const roleId of uncovered) {
        const role = await tx.role.findUniqueOrThrow({ where: { id: roleId } });
        const inst = await tx.requestStepInstance.create({
          data: {
            requestId: req.id,
            workflowStepId: step.id,
            stepKey: `${step.key}:${role.code}`,
            stageIndex: stages.get(step.id)!,
            sortOrder: step.sortOrder,
            parallelGroup: step.parallelGroup,
            kind: step.kind,
            nameAr: role.nameAr,
            nameEn: role.nameEn,
            roleId: role.id,
            roleNameAr: role.nameAr,
            roleNameEn: role.nameEn,
          },
        });
        created.push({ inst, step });
      }
    }
  }
  for (const { inst, step } of created) {
    if (!appliesFor(step, inst.roleId, base)) {
      await tx.requestStepInstance.update({ where: { id: inst.id }, data: { status: 'NOT_APPLICABLE' } });
      await addEvent(tx, {
        requestId: req.id,
        type: 'STEP_NOT_APPLICABLE',
        actor,
        stepInstanceId: inst.id,
        data: { stepKey: inst.stepKey },
      });
    }
  }
}

async function activateInstance(
  tx: Db,
  req: Request,
  inst: RequestStepInstance,
  step: WorkflowStep,
  now: Date,
  actor: Actor,
): Promise<void> {
  await tx.requestStepInstance.update({
    where: { id: inst.id },
    data: { status: 'ACTIVE', activatedAt: now, dueAt: slaDue(now, step.slaHours) },
  });
  await addEvent(tx, { requestId: req.id, type: 'STEP_ACTIVATED', actor, stepInstanceId: inst.id, data: { stepKey: inst.stepKey } });
  const m = userMessages.stepWaiting(req.number, inst.nameAr, inst.nameEn);
  await notifyRole(tx, { roleId: inst.roleId, departmentId: req.departmentId, type: 'STEP_WAITING', requestId: req.id, ...m });
}

/**
 * Moves the request forward when the current stage has no ACTIVE/AWAITING_CORRECTION instance left:
 * activates the next stage that has an applicable step, or completes the request (PLAN 5.4).
 */
export async function advance(tx: Db, requestId: string, actor: Actor, now = new Date()): Promise<void> {
  const req = await tx.request.findUniqueOrThrow({ where: { id: requestId }, include: { requestType: true } });
  const instances = await tx.requestStepInstance.findMany({ where: { requestId } });
  const cur = req.currentStageIndex;
  if (cur !== null && instances.some((i) => i.stageIndex === cur && (i.status === 'ACTIVE' || i.status === 'AWAITING_CORRECTION'))) {
    return;
  }
  const stageIdx = [...new Set(instances.map((i) => i.stageIndex))].filter((s) => cur === null || s > cur).sort((a, b) => a - b);
  const steps = await tx.workflowStep.findMany({ where: { workflowVersionId: req.workflowVersionId } });
  const stepById = new Map(steps.map((s) => [s.id, s]));
  const base = await loadFactsBase(tx, requestId);
  for (const s of stageIdx) {
    const toEval = instances.filter((i) => i.stageIndex === s && (i.status === 'PENDING' || i.status === 'NOT_APPLICABLE'));
    let activated = 0;
    for (const inst of toEval) {
      const step = stepById.get(inst.workflowStepId)!;
      if (appliesFor(step, inst.roleId, base)) {
        await activateInstance(tx, req, inst, step, now, actor);
        activated++;
      } else if (inst.status === 'PENDING') {
        await tx.requestStepInstance.update({ where: { id: inst.id }, data: { status: 'NOT_APPLICABLE' } });
        await addEvent(tx, { requestId, type: 'STEP_NOT_APPLICABLE', actor, stepInstanceId: inst.id, data: { stepKey: inst.stepKey } });
      }
    }
    if (activated > 0) {
      await tx.request.update({ where: { id: requestId }, data: { currentStageIndex: s } });
      if (req.submitterId) {
        const names = toEval
          .filter((i) => appliesFor(stepById.get(i.workflowStepId)!, i.roleId, base))
          .map((i) => i.nameAr)
          .join(' و ');
        await notifySubmitter(tx, {
          submitterId: req.submitterId,
          type: 'REQ_AT_STEP',
          requestId,
          bodyAr: submitterMessages.REQ_AT_STEP(req.number, names),
          data: { requestNumber: req.number, stageIndex: s },
        });
      }
      return;
    }
  }
  // nothing left: complete
  const done = await touchRequest(tx, requestId, {
    status: req.paidAt ? 'PAID' : 'APPROVED',
    completedAt: now,
    currentStageIndex: null,
  });
  const mod = getModule(req.requestType.moduleKey);
  if (mod?.onCompleted) await mod.onCompleted(tx, done);
  await addEvent(tx, { requestId, type: 'COMPLETED', actor, data: { status: done.status } });
}

/**
 * After any line change: instances of later stages (PENDING / NOT_APPLICABLE) are recomputed and slot
 * stages may gain instances. Stages at or before the current one are frozen (D22).
 */
export async function reevaluateLaterStages(tx: Db, requestId: string, actor: Actor): Promise<void> {
  const req = await tx.request.findUniqueOrThrow({ where: { id: requestId } });
  if (req.currentStageIndex === null) return;
  const cur = req.currentStageIndex;
  const steps = await tx.workflowStep.findMany({
    where: { workflowVersionId: req.workflowVersionId },
    orderBy: { sortOrder: 'asc' },
  });
  const stages = computeStages(steps);
  const base = await loadFactsBase(tx, requestId);
  const uncovered = uncoveredRoleIds(steps, base);
  let instances = await tx.requestStepInstance.findMany({ where: { requestId } });
  // new slot expansions in later stages
  for (const step of steps.filter((s) => s.stepType === 'DYNAMIC_CATEGORY_ROLES')) {
    const stage = stages.get(step.id)!;
    if (stage <= cur) continue;
    for (const roleId of uncovered) {
      const role = await tx.role.findUniqueOrThrow({ where: { id: roleId } });
      const key = `${step.key}:${role.code}`;
      if (instances.some((i) => i.stepKey === key)) continue;
      await tx.requestStepInstance.create({
        data: {
          requestId,
          workflowStepId: step.id,
          stepKey: key,
          stageIndex: stage,
          sortOrder: step.sortOrder,
          parallelGroup: step.parallelGroup,
          kind: step.kind,
          nameAr: role.nameAr,
          nameEn: role.nameEn,
          roleId: role.id,
          roleNameAr: role.nameAr,
          roleNameEn: role.nameEn,
        },
      });
    }
  }
  instances = await tx.requestStepInstance.findMany({ where: { requestId } });
  const stepById = new Map(steps.map((s) => [s.id, s]));
  for (const inst of instances) {
    if (inst.stageIndex <= cur) continue;
    if (inst.status !== 'PENDING' && inst.status !== 'NOT_APPLICABLE') continue;
    const ok = appliesFor(stepById.get(inst.workflowStepId)!, inst.roleId, base);
    const next = ok ? 'PENDING' : 'NOT_APPLICABLE';
    if (next !== inst.status) {
      await tx.requestStepInstance.update({ where: { id: inst.id }, data: { status: next } });
      if (next === 'NOT_APPLICABLE') {
        await addEvent(tx, { requestId, type: 'STEP_NOT_APPLICABLE', actor, stepInstanceId: inst.id, data: { stepKey: inst.stepKey } });
      }
    }
  }
}

export async function slaHoursOf(tx: Db, workflowStepId: string): Promise<number | null> {
  const s = await tx.workflowStep.findUnique({ where: { id: workflowStepId }, select: { slaHours: true } });
  return s?.slaHours ?? null;
}
