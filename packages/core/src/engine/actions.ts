import { Prisma, type PrismaClient, type Request, type RequestStepInstance, type WorkflowStep } from '@prisma/client';
import { checklistSchema, dec, type AuthUser } from '@dms/shared';
import type { Actor, Db } from '../common';
import { audit } from '../audit';
import { getSetting } from '../config';
import { DomainError } from '../errors';
import { notifySubmitter, notifyRole, notifyUsers, submitterMessages, userMessages } from '../notifications';
import { hasPermission, type EffectiveRole } from '../rbac';
import { advance, reevaluateLaterStages } from './advance';
import {
  addEvent,
  checkAmount,
  computeQtyPrice,
  computeWarnings,
  lockRequestRow,
  OPEN_STATUSES,
  recomputeTotals,
  refreshWarnings,
  runTx,
  slaDue,
  touchRequest,
} from './helpers';
import { toJsonValue } from '../audit';
import { ensureLockForAction } from './locks';
import { getModule } from './registry';
import { flagDuplicatesSafe } from './submit';
import type { ActionCtx } from './types';

type StepAction = 'APPROVE' | 'REQUEST_CORRECTION' | 'SEND_BACK' | 'REJECT';

interface ActCtx {
  req: Request;
  inst: RequestStepInstance;
  step: WorkflowStep;
  role: EffectiveRole;
  moduleKey: string | null;
}

/** Common preconditions of every action (PLAN 5.6 assertCanAct). Locks the request row first. */
async function assertCanAct(
  tx: Db,
  a: { requestId: string; stepInstanceId: string; user: AuthUser },
  action: StepAction | 'EDIT',
  opts: { acquireLock?: boolean } = {},
): Promise<ActCtx> {
  const req = await lockRequestRow(tx, a.requestId);
  const inst = await tx.requestStepInstance.findUnique({ where: { id: a.stepInstanceId }, include: { workflowStep: true } });
  if (!inst || inst.requestId !== req.id) throw new DomainError('NOT_FOUND', 'Step not found on this request');
  const role = a.user.roles.find(
    (r) => r.roleId === inst.roleId && (r.scopeDepartmentId === null || r.scopeDepartmentId === req.departmentId),
  );
  if (!role) throw new DomainError('FORBIDDEN', 'You do not hold the role of this step');
  if (!hasPermission(a.user, 'requests.act')) throw new DomainError('FORBIDDEN', 'requests.act is required');
  if (!(OPEN_STATUSES as readonly string[]).includes(req.status)) {
    throw new DomainError('INVALID_STATE', `Request is ${req.status}`);
  }
  if (inst.status !== 'ACTIVE') throw new DomainError('INVALID_STATE', `Step is ${inst.status}, not ACTIVE`);
  if (action !== 'EDIT' && !inst.workflowStep.allowedActions.includes(action)) {
    throw new DomainError('FORBIDDEN', `Action ${action} is not allowed at this step`);
  }
  if (opts.acquireLock !== false) await ensureLockForAction(tx, req.id, a.user);
  const type = await tx.requestType.findUniqueOrThrow({ where: { id: req.requestTypeId }, select: { moduleKey: true } });
  return { req, inst, step: inst.workflowStep, role, moduleKey: type.moduleKey };
}

async function releaseOwnLock(tx: Db, requestId: string, userId: string): Promise<void> {
  await tx.requestLock.deleteMany({ where: { requestId, userId } });
}

const userActor = (a: Actor, user: AuthUser): Actor => ({ ...a, type: 'USER', userId: user.id, label: a.label ?? user.username });

// ------------------------------------------------------------------ approve
export async function approveStep(
  prisma: PrismaClient,
  a: {
    requestId: string;
    stepInstanceId: string;
    user: AuthUser;
    comment?: string;
    checklist?: Record<string, boolean>;
    actionData?: Record<string, unknown>;
    actor: Actor;
  },
): Promise<void> {
  await runTx(prisma, async (tx) => {
    const { req, inst, step, role, moduleKey } = await assertCanAct(tx, a, 'APPROVE');
    const actor = userActor(a.actor, a.user);
    const hasOpen = await tx.correctionRequest.count({ where: { stepInstanceId: inst.id, status: 'OPEN' } });
    if (hasOpen) throw new DomainError('INVALID_STATE', 'This step has an open correction request');
    const checklist = checklistSchema.parse(step.checklist ?? []);
    for (const item of checklist) {
      if (item.required && a.checklist?.[item.key] !== true) {
        throw new DomainError('VALIDATION', `Checklist item "${item.key}" must be confirmed`, undefined, { key: item.key });
      }
    }
    const sig = await tx.signature.findFirst({ where: { userId: a.user.id, isActive: true } });
    if ((await getSetting(tx, 'workflow.requireSignatureToApprove')) && !sig) {
      throw new DomainError('VALIDATION', 'An uploaded signature is required to approve', undefined, { code: 'SIGNATURE_REQUIRED' });
    }
    const mod = getModule(moduleKey);
    const ctx: ActionCtx = { requestId: req.id, stepInstanceId: inst.id, user: a.user, actionData: a.actionData, actor };
    const now = new Date();
    if (step.kind === 'PAYMENT' && mod?.beforeApprove) await mod.beforeApprove(tx, ctx);
    await tx.requestStepInstance.update({
      where: { id: inst.id },
      data: {
        status: 'APPROVED',
        actedAt: now,
        actedById: a.user.id,
        signatureId: sig?.id ?? null,
        comment: a.comment ?? null,
        checklist: toJsonValue(a.checklist),
        delegationId: role.viaDelegationId ?? null,
        onBehalfOfUserId: role.onBehalfOfUserId ?? null,
        dueAt: null,
      },
    });
    await addEvent(tx, {
      requestId: req.id,
      type: 'STEP_APPROVED',
      actor,
      stepInstanceId: inst.id,
      comment: a.comment,
      data: { stepKey: inst.stepKey, viaDelegationId: role.viaDelegationId, onBehalfOfUserId: role.onBehalfOfUserId },
    });
    if (step.kind === 'PAYMENT') {
      const paid = await touchRequest(tx, req.id, { paidAt: now, paidById: a.user.id, status: 'PAID' });
      if (mod?.onPaid) await mod.onPaid(tx, paid, ctx);
      await addEvent(tx, { requestId: req.id, type: 'PAID', actor, stepInstanceId: inst.id });
      if (req.submitterId) {
        await notifySubmitter(tx, {
          submitterId: req.submitterId,
          type: 'REQ_PAID',
          requestId: req.id,
          bodyAr: submitterMessages.REQ_PAID(req.number),
          data: { requestNumber: req.number },
        });
      }
    } else {
      await touchRequest(tx, req.id);
    }
    await releaseOwnLock(tx, req.id, a.user.id);
    await advance(tx, req.id, actor, now);
    await audit(tx, { actor, action: 'request.approve', entityType: 'Request', entityId: req.id, meta: { stepKey: inst.stepKey } });
  });
}

// ------------------------------------------------------------------ request correction
export async function requestCorrection(
  prisma: PrismaClient,
  a: {
    requestId: string;
    stepInstanceId: string;
    user: AuthUser;
    items: { lineId?: string; attachmentId?: string; reasonCode: string; fixType: string; comment: string }[];
    actor: Actor;
  },
): Promise<void> {
  await runTx(prisma, async (tx) => {
    const { req, inst } = await assertCanAct(tx, a, 'REQUEST_CORRECTION');
    const actor = userActor(a.actor, a.user);
    if (a.items.length === 0) throw new DomainError('VALIDATION', 'At least one correction item is required');
    const ids: string[] = [];
    const comments: string[] = [];
    for (const it of a.items) {
      if (!it.comment || !it.comment.trim()) throw new DomainError('VALIDATION', 'A comment is required for each correction item');
      if (!['REUPLOAD', 'AMOUNT', 'BOTH'].includes(it.fixType)) throw new DomainError('VALIDATION', `Invalid fixType ${it.fixType}`);
      if (!it.lineId && !it.attachmentId) throw new DomainError('VALIDATION', 'A line and/or attachment is required');
      let lineId = it.lineId ?? null;
      if (it.attachmentId) {
        const att = await tx.attachment.findUnique({ where: { id: it.attachmentId } });
        if (!att || att.requestId !== req.id) throw new DomainError('VALIDATION', 'Attachment does not belong to this request');
        if (lineId && att.lineId !== lineId) throw new DomainError('VALIDATION', 'Attachment does not belong to the given line');
        lineId = att.lineId;
      }
      if (lineId) {
        const line = await tx.requestLine.findUnique({ where: { id: lineId } });
        if (!line || line.requestId !== req.id) throw new DomainError('VALIDATION', 'Line does not belong to this request');
      }
      const row = await tx.correctionRequest.create({
        data: {
          requestId: req.id,
          stepInstanceId: inst.id,
          requestedById: a.user.id,
          lineId,
          attachmentId: it.attachmentId ?? null,
          reasonCode: it.reasonCode,
          fixType: it.fixType as 'REUPLOAD' | 'AMOUNT' | 'BOTH',
          comment: it.comment.trim(),
        },
      });
      ids.push(row.id);
      comments.push(it.comment.trim());
    }
    await tx.requestStepInstance.update({
      where: { id: inst.id },
      data: { status: 'AWAITING_CORRECTION', dueAt: null, correctionRequestedById: a.user.id },
    });
    await touchRequest(tx, req.id, { status: 'CORRECTION_REQUESTED' });
    await addEvent(tx, {
      requestId: req.id,
      type: 'CORRECTION_REQUESTED',
      actor,
      stepInstanceId: inst.id,
      comment: comments.join(' | '),
      data: { correctionRequestIds: ids },
    });
    if (req.submitterId) {
      await notifySubmitter(tx, {
        submitterId: req.submitterId,
        type: 'REQ_CORRECTION',
        requestId: req.id,
        bodyAr: submitterMessages.REQ_CORRECTION(req.number, comments),
        data: { requestNumber: req.number, correctionRequestIds: ids },
      });
    }
    await releaseOwnLock(tx, req.id, a.user.id);
    await audit(tx, { actor, action: 'request.request_correction', entityType: 'Request', entityId: req.id, meta: { correctionRequestIds: ids } });
  });
}

// ------------------------------------------------------------------ send back
export async function sendBack(
  prisma: PrismaClient,
  a: { requestId: string; stepInstanceId: string; user: AuthUser; comment: string; actor: Actor },
): Promise<void> {
  await runTx(prisma, async (tx) => {
    const { req, inst } = await assertCanAct(tx, a, 'SEND_BACK');
    const actor = userActor(a.actor, a.user);
    if (!a.comment || !a.comment.trim()) throw new DomainError('VALIDATION', 'A comment is required to send back');
    const all = await tx.requestStepInstance.findMany({ where: { requestId: req.id } });
    const targetStage = Math.max(-1, ...all.filter((i) => i.stageIndex < inst.stageIndex && i.status === 'APPROVED').map((i) => i.stageIndex));
    if (targetStage < 0) {
      throw new DomainError('INVALID_STATE', 'This is the first step: reject or request a correction instead');
    }
    const now = new Date();
    const reset = {
      actedAt: null,
      actedById: null,
      onBehalfOfUserId: null,
      delegationId: null,
      signatureId: null,
      comment: null,
    };
    // current stage -> PENDING
    for (const i of all.filter((x) => x.stageIndex === inst.stageIndex && ['ACTIVE', 'AWAITING_CORRECTION', 'APPROVED'].includes(x.status))) {
      await tx.requestStepInstance.update({
        where: { id: i.id },
        data: { ...reset, checklist: Prisma.DbNull, status: 'PENDING', activatedAt: null, dueAt: null },
      });
    }
    const cancelled = await tx.correctionRequest.findMany({
      where: { requestId: req.id, status: 'OPEN', stepInstance: { stageIndex: inst.stageIndex } },
    });
    for (const c of cancelled) {
      await tx.correctionRequest.update({ where: { id: c.id }, data: { status: 'CANCELLED', resolvedAt: now } });
      await addEvent(tx, { requestId: req.id, type: 'CORRECTION_CANCELLED', actor, stepInstanceId: c.stepInstanceId, data: { correctionRequestId: c.id } });
    }
    // target stage -> ACTIVE
    const steps = await tx.workflowStep.findMany({ where: { workflowVersionId: req.workflowVersionId } });
    const targets = all.filter((i) => i.stageIndex === targetStage && i.status === 'APPROVED');
    for (const t of targets) {
      const step = steps.find((s) => s.id === t.workflowStepId);
      await tx.requestStepInstance.update({
        where: { id: t.id },
        data: {
          ...reset,
          checklist: Prisma.DbNull,
          status: 'ACTIVE',
          activatedAt: now,
          returnedAt: now,
          dueAt: slaDue(now, step?.slaHours),
        },
      });
    }
    await touchRequest(tx, req.id, { status: 'IN_REVIEW', currentStageIndex: targetStage });
    await addEvent(tx, {
      requestId: req.id,
      type: 'STEP_SENT_BACK',
      actor,
      stepInstanceId: inst.id,
      comment: a.comment.trim(),
      data: { fromStage: inst.stageIndex, toStage: targetStage, targetStepKeys: targets.map((t) => t.stepKey) },
    });
    for (const t of targets) {
      const m = userMessages.stepWaiting(req.number, t.nameAr, t.nameEn);
      await notifyRole(tx, { roleId: t.roleId, departmentId: req.departmentId, type: 'STEP_WAITING', requestId: req.id, ...m, data: { sentBack: true } });
    }
    await releaseOwnLock(tx, req.id, a.user.id);
    await audit(tx, { actor, action: 'request.send_back', entityType: 'Request', entityId: req.id, meta: { toStage: targetStage } });
  });
}

// ------------------------------------------------------------------ reject
export async function rejectRequest(
  prisma: PrismaClient,
  a: { requestId: string; stepInstanceId: string; user: AuthUser; reason: string; actor: Actor },
): Promise<void> {
  await runTx(prisma, async (tx) => {
    const { req, inst, moduleKey } = await assertCanAct(tx, a, 'REJECT');
    const actor = userActor(a.actor, a.user);
    if (!a.reason || !a.reason.trim()) throw new DomainError('VALIDATION', 'A reason is required to reject');
    const now = new Date();
    await tx.requestStepInstance.update({
      where: { id: inst.id },
      data: { status: 'REJECTED', actedAt: now, actedById: a.user.id, comment: a.reason.trim(), dueAt: null },
    });
    await tx.requestStepInstance.updateMany({
      where: { requestId: req.id, id: { not: inst.id }, status: { in: ['PENDING', 'ACTIVE', 'AWAITING_CORRECTION'] } },
      data: { status: 'CANCELLED', dueAt: null },
    });
    const open = await tx.correctionRequest.findMany({ where: { requestId: req.id, status: 'OPEN' } });
    for (const c of open) {
      await tx.correctionRequest.update({ where: { id: c.id }, data: { status: 'CANCELLED', resolvedAt: now } });
      await addEvent(tx, { requestId: req.id, type: 'CORRECTION_CANCELLED', actor, stepInstanceId: c.stepInstanceId, data: { correctionRequestId: c.id } });
    }
    const rejected = await touchRequest(tx, req.id, {
      status: 'REJECTED',
      rejectedAt: now,
      rejectedById: a.user.id,
      rejectionReason: a.reason.trim(),
      currentStageIndex: null,
      completedAt: now,
    });
    const mod = getModule(moduleKey);
    if (mod?.onRejected) await mod.onRejected(tx, rejected);
    await addEvent(tx, { requestId: req.id, type: 'REJECTED', actor, stepInstanceId: inst.id, comment: a.reason.trim() });
    if (req.submitterId) {
      await notifySubmitter(tx, {
        submitterId: req.submitterId,
        type: 'REQ_REJECTED',
        requestId: req.id,
        bodyAr: submitterMessages.REQ_REJECTED(req.number, a.reason.trim()),
        data: { requestNumber: req.number },
      });
    }
    await tx.requestLock.deleteMany({ where: { requestId: req.id } });
    await audit(tx, { actor, action: 'request.reject', entityType: 'Request', entityId: req.id, meta: { reason: a.reason } });
  });
}

// ------------------------------------------------------------------ edit line (accountant / chief)
export async function editLine(
  prisma: PrismaClient,
  a: {
    requestId: string;
    stepInstanceId: string;
    lineId: string;
    user: AuthUser;
    amount?: string;
    categoryId?: string;
    extraValues?: Record<string, string>;
    reason: string;
    actor: Actor;
  },
): Promise<void> {
  await runTx(prisma, async (tx) => {
    const { req, inst, step, moduleKey } = await assertCanAct(tx, a, 'EDIT');
    const actor = userActor(a.actor, a.user);
    if (!a.reason || !a.reason.trim()) throw new DomainError('VALIDATION', 'A reason is required');
    const wantsAmount = a.amount !== undefined || a.extraValues !== undefined;
    const wantsCategory = a.categoryId !== undefined;
    if (!wantsAmount && !wantsCategory) throw new DomainError('VALIDATION', 'Nothing to change');
    if (wantsAmount && !(step.canEditAmounts && hasPermission(a.user, 'requests.edit_amounts'))) {
      throw new DomainError('FORBIDDEN', 'Editing amounts is not allowed at this step');
    }
    if (wantsCategory && !(step.canReclassify && hasPermission(a.user, 'requests.reclassify'))) {
      throw new DomainError('FORBIDDEN', 'Reclassifying is not allowed at this step');
    }
    const line = await tx.requestLine.findUnique({ where: { id: a.lineId }, include: { category: true } });
    if (!line || line.requestId !== req.id) throw new DomainError('NOT_FOUND', 'Line not found on this request');

    let category = line.category;
    if (wantsCategory && a.categoryId !== line.categoryId) {
      const c = await tx.lineCategory.findUnique({ where: { id: a.categoryId! } });
      if (!c || c.requestTypeId !== req.requestTypeId) throw new DomainError('VALIDATION', 'Category does not belong to the request type');
      if (!c.isActive) throw new DomainError('VALIDATION', 'Category is inactive');
      category = c;
    }
    const newAmount = a.amount !== undefined ? checkAmount(a.amount, { allowZero: true }) : dec(line.amount).toFixed(2);
    const oldExtra = (line.extraValues ?? {}) as Record<string, string>;
    const newExtra = a.extraValues ? { ...oldExtra, ...a.extraValues } : oldExtra;

    const edits: { field: string; oldValue: string | null; newValue: string | null; oldLabel?: string; newLabel?: string }[] = [];
    if (dec(newAmount).comparedTo(dec(line.amount)) !== 0) {
      edits.push({ field: 'amount', oldValue: dec(line.amount).toFixed(2), newValue: newAmount });
    }
    if (category.id !== line.categoryId) {
      edits.push({
        field: 'categoryId',
        oldValue: line.categoryId,
        newValue: category.id,
        oldLabel: line.categoryNameAr,
        newLabel: category.nameAr,
      });
    }
    for (const k of Object.keys(a.extraValues ?? {})) {
      if ((oldExtra[k] ?? '') !== (newExtra[k] ?? '')) {
        edits.push({ field: `extra.${k}`, oldValue: oldExtra[k] ?? null, newValue: newExtra[k] ?? null });
      }
    }
    if (edits.length === 0) throw new DomainError('VALIDATION', 'No change detected');

    for (const e of edits) {
      await tx.lineEdit.create({
        data: {
          requestId: req.id,
          lineId: line.id,
          stepInstanceId: inst.id,
          source: 'APPROVER',
          editedByUserId: a.user.id,
          field: e.field,
          oldValue: e.oldValue,
          newValue: e.newValue,
          oldLabel: e.oldLabel ?? null,
          newLabel: e.newLabel ?? null,
          reason: a.reason.trim(),
        },
      });
    }
    const qp = computeQtyPrice(category.quantityFieldKey, newExtra, newAmount);
    const updated = await tx.requestLine.update({
      where: { id: line.id },
      data: {
        amount: newAmount,
        categoryId: category.id,
        categoryNameAr: category.nameAr,
        categoryNameEn: category.nameEn,
        extraValues: toJsonValue(newExtra) ?? {},
        quantity: qp.quantity,
        unitPrice: qp.unitPrice,
        isEdited: true,
      },
    });
    const changedFields = edits.map((e) => (e.field === 'categoryId' ? 'categoryId' : e.field));
    const mod = getModule(moduleKey);
    if (mod?.onLineChanged) await mod.onLineChanged(tx, req, updated, changedFields);
    await tx.requestLine.update({
      where: { id: line.id },
      data: { warnings: toJsonValue(await computeWarnings(tx, updated, category, moduleKey)) ?? [] },
    });
    await recomputeTotals(tx, req.id);
    await reevaluateLaterStages(tx, req.id, actor);
    await touchRequest(tx, req.id);
    await addEvent(tx, {
      requestId: req.id,
      type: 'LINE_EDITED',
      actor,
      stepInstanceId: inst.id,
      lineId: line.id,
      comment: a.reason.trim(),
      data: { edits },
    });
    if (req.submitterId) {
      const detail = edits
        .map((e) =>
          e.field === 'amount'
            ? `المبلغ من ${e.oldValue} إلى ${e.newValue}`
            : e.field === 'categoryId'
              ? `النوع من ${e.oldLabel} إلى ${e.newLabel}`
              : `${e.field}`,
        )
        .join('، ');
      await notifySubmitter(tx, {
        submitterId: req.submitterId,
        type: 'REQ_LINE_EDITED',
        requestId: req.id,
        bodyAr: submitterMessages.REQ_LINE_EDITED(req.number, `${detail} (السبب: ${a.reason.trim()})`),
        data: { requestNumber: req.number, lineId: line.id },
      });
    }
    await audit(tx, { actor, action: 'request.edit_line', entityType: 'Request', entityId: req.id, before: { amount: line.amount, categoryId: line.categoryId }, after: { amount: newAmount, categoryId: category.id }, meta: { lineId: line.id, reason: a.reason } });
  });
}

// ------------------------------------------------------------------ corrections (submitter side)
export async function listOpenCorrections(db: Db, submitterId: string) {
  const rows = await db.correctionRequest.findMany({
    where: { status: 'OPEN', request: { submitterId } },
    include: { request: { select: { number: true } } },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map((c) => ({
    id: c.id,
    requestId: c.requestId,
    requestNumber: c.request.number,
    lineId: c.lineId,
    attachmentId: c.attachmentId,
    reasonCode: c.reasonCode,
    fixType: c.fixType,
    comment: c.comment,
  }));
}

export async function submitCorrection(
  prisma: PrismaClient,
  a: { correctionRequestId: string; submitterId: string; newAttachmentIds?: string[]; newAmount?: string },
): Promise<{ returnedToStep: boolean }> {
  const pre = await prisma.correctionRequest.findUnique({ where: { id: a.correctionRequestId }, select: { requestId: true } });
  if (!pre) throw new DomainError('NOT_FOUND', 'Correction request not found');
  return runTx(prisma, async (tx) => {
    const req = await lockRequestRow(tx, pre.requestId);
    const actor: Actor = { type: 'SUBMITTER', submitterId: a.submitterId };
    const corr = await tx.correctionRequest.findUniqueOrThrow({ where: { id: a.correctionRequestId } });
    if (req.submitterId !== a.submitterId) throw new DomainError('FORBIDDEN', 'This correction belongs to another submitter');
    if (corr.status !== 'OPEN') throw new DomainError('INVALID_STATE', `Correction is ${corr.status}`);
    if (req.status !== 'CORRECTION_REQUESTED') throw new DomainError('INVALID_STATE', `Request is ${req.status}`);
    const newIds = a.newAttachmentIds ?? [];
    const needsFiles = corr.fixType === 'REUPLOAD' || corr.fixType === 'BOTH';
    const needsAmount = corr.fixType === 'AMOUNT' || corr.fixType === 'BOTH';
    if (needsFiles && newIds.length === 0) throw new DomainError('VALIDATION', 'At least one new attachment is required');
    if (needsAmount && !corr.lineId) throw new DomainError('VALIDATION', 'An amount correction needs a line');
    if (needsAmount && a.newAmount === undefined) throw new DomainError('VALIDATION', 'A new amount is required');
    const now = new Date();
    const resolution: Record<string, unknown> = {};

    let targetLineId = corr.lineId;
    if (needsFiles) {
      const news = await tx.attachment.findMany({ where: { id: { in: newIds } } });
      if (news.length !== newIds.length) throw new DomainError('VALIDATION', 'Attachment not found');
      for (const n of news) {
        if (n.requestId && n.requestId !== req.id) throw new DomainError('VALIDATION', 'Attachment belongs to another request');
        if (n.uploadedBySubmitterId !== a.submitterId) throw new DomainError('FORBIDDEN', 'Attachment is not yours');
      }
      const target = corr.attachmentId ? await tx.attachment.findUnique({ where: { id: corr.attachmentId } }) : null;
      targetLineId = corr.lineId ?? target?.lineId ?? null;
      const toSupersede = corr.attachmentId
        ? target
          ? [target]
          : []
        : targetLineId
          ? await tx.attachment.findMany({ where: { lineId: targetLineId, isCurrent: true, id: { notIn: newIds } } })
          : [];
      await tx.attachment.updateMany({
        where: { id: { in: newIds } },
        data: { requestId: req.id, lineId: targetLineId, correctionRequestId: corr.id, botSessionId: null },
      });
      for (const old of toSupersede) {
        await tx.attachment.update({ where: { id: old.id }, data: { isCurrent: false, supersededById: newIds[0], supersededAt: now } });
        await addEvent(tx, { requestId: req.id, type: 'ATTACHMENT_SUPERSEDED', actor, lineId: old.lineId, attachmentId: old.id, data: { supersededById: newIds[0] } });
      }
      resolution.newAttachmentIds = newIds;
    }
    if (needsAmount) {
      const newAmount = checkAmount(a.newAmount);
      const line = await tx.requestLine.findUniqueOrThrow({ where: { id: corr.lineId! }, include: { category: true } });
      resolution.oldAmount = dec(line.amount).toFixed(2);
      resolution.newAmount = newAmount;
      if (dec(newAmount).comparedTo(dec(line.amount)) !== 0) {
        await tx.lineEdit.create({
          data: {
            requestId: req.id,
            lineId: line.id,
            stepInstanceId: corr.stepInstanceId,
            correctionRequestId: corr.id,
            source: 'SUBMITTER_CORRECTION',
            editedBySubmitterId: a.submitterId,
            field: 'amount',
            oldValue: dec(line.amount).toFixed(2),
            newValue: newAmount,
            reason: corr.comment,
          },
        });
        const qp = computeQtyPrice(line.category.quantityFieldKey, (line.extraValues ?? {}) as Record<string, string>, newAmount);
        const updated = await tx.requestLine.update({
          where: { id: line.id },
          data: { amount: newAmount, quantity: qp.quantity, unitPrice: qp.unitPrice, isEdited: true },
        });
        const type = await tx.requestType.findUniqueOrThrow({ where: { id: req.requestTypeId } });
        const mod = getModule(type.moduleKey);
        if (mod?.onLineChanged) await mod.onLineChanged(tx, req, updated, ['amount']);
        await addEvent(tx, { requestId: req.id, type: 'LINE_EDITED', actor, lineId: line.id, stepInstanceId: corr.stepInstanceId, data: { edits: [{ field: 'amount', oldValue: resolution.oldAmount, newValue: newAmount }], source: 'SUBMITTER_CORRECTION' } });
      }
    }
    await tx.correctionRequest.update({ where: { id: corr.id }, data: { status: 'RESOLVED', resolvedAt: now, resolution: toJsonValue(resolution) } });
    await addEvent(tx, { requestId: req.id, type: 'CORRECTION_SUBMITTED', actor, stepInstanceId: corr.stepInstanceId, lineId: corr.lineId, data: { correctionRequestId: corr.id, ...resolution } });
    await recomputeTotals(tx, req.id);
    await refreshWarnings(tx, req.id);
    if (needsFiles) await flagDuplicatesSafe(tx, req.id);
    await reevaluateLaterStages(tx, req.id, actor);

    const stillOpenOnStep = await tx.correctionRequest.count({ where: { stepInstanceId: corr.stepInstanceId, status: 'OPEN' } });
    let returned = false;
    if (stillOpenOnStep === 0) {
      const inst = await tx.requestStepInstance.findUniqueOrThrow({ where: { id: corr.stepInstanceId }, include: { workflowStep: true } });
      if (inst.status === 'AWAITING_CORRECTION') {
        await tx.requestStepInstance.update({
          where: { id: inst.id },
          data: { status: 'ACTIVE', returnedAt: now, dueAt: slaDue(now, inst.workflowStep.slaHours) },
        });
        returned = true;
        const m = userMessages.correctionReturned(req.number, inst.nameAr, inst.nameEn);
        await notifyUsers(tx, { userIds: [inst.correctionRequestedById ?? corr.requestedById], type: 'CORRECTION_RETURNED', requestId: req.id, ...m });
      }
    }
    const anyOpen = await tx.correctionRequest.count({ where: { requestId: req.id, status: 'OPEN' } });
    await touchRequest(tx, req.id, { status: anyOpen > 0 ? 'CORRECTION_REQUESTED' : 'IN_REVIEW' });
    await audit(tx, { actor, action: 'request.submit_correction', entityType: 'Request', entityId: req.id, meta: { correctionRequestId: corr.id } });
    return { returnedToStep: returned };
  });
}
