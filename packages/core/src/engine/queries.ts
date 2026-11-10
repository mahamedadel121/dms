import type { Prisma } from '@prisma/client';
import { checklistSchema, type AuthUser, type ChecklistItem } from '@dms/shared';
import type { Db } from '../common';
import { DomainError } from '../errors';
import { signFileUrl } from '../storage';
import { hasPermission } from '../rbac';
import { getModule } from './registry';
import type {
  OpenCorrection,
  Paged,
  QueueCounter,
  QueueFilters,
  QueueItem,
  RequestDetail,
  RequestFilters,
  RequestListItem,
} from './types';
import { OPEN_STATUSES } from './helpers';

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

function url(key: string | null | undefined): string | null {
  if (!key) return null;
  try {
    return signFileUrl(key);
  } catch {
    return null; // storage unavailable (tests without STORAGE config): URLs are optional
  }
}

// ------------------------------------------------------------------ visibility
function deptScopeWhere(user: AuthUser): Prisma.RequestWhereInput | null {
  // view_all restricted by role scope: if every effective role is department-scoped, limit to those departments
  const roles = user.roles.filter((r) => !r.isSuperUser);
  if (user.isSuperUser || roles.length === 0 || roles.some((r) => r.scopeDepartmentId === null)) return null;
  return { departmentId: { in: roles.map((r) => r.scopeDepartmentId as string) } };
}

/** Prisma filter selecting the requests the user may see (PLAN 5.7). null = no access at all. */
export function visibilityWhere(user: AuthUser): Prisma.RequestWhereInput | null {
  const viewAll = hasPermission(user, 'requests.view_all');
  const view = hasPermission(user, 'requests.view');
  if (!viewAll && !view) return null;
  if (viewAll) return deptScopeWhere(user) ?? {};
  const roleConds: Prisma.RequestStepInstanceWhereInput[] = user.roles
    .filter((r) => !r.isSuperUser)
    .map((r) => ({
      roleId: r.roleId,
      status: { notIn: ['NOT_APPLICABLE' as const] },
      ...(r.scopeDepartmentId ? { request: { departmentId: r.scopeDepartmentId } } : {}),
    }));
  return {
    OR: [
      ...(roleConds.length ? [{ stepInstances: { some: { OR: roleConds } } }] : []),
      { submittedByUserId: user.id },
    ],
  };
}

export async function canViewRequest(db: Db, user: AuthUser, requestId: string): Promise<boolean> {
  const where = visibilityWhere(user);
  if (!where) return false;
  const n = await db.request.count({ where: { AND: [{ id: requestId }, where] } });
  return n > 0;
}

// ------------------------------------------------------------------ queue
function queueRoleWhere(user: AuthUser, roleId?: string): Prisma.RequestStepInstanceWhereInput | null {
  const roles = user.roles.filter((r) => !roleId || r.roleId === roleId);
  if (roles.length === 0) return null;
  return {
    OR: roles.map((r) => ({
      roleId: r.roleId,
      ...(r.scopeDepartmentId ? { request: { departmentId: r.scopeDepartmentId } } : {}),
    })),
  };
}

export async function listQueue(db: Db, user: AuthUser, f: QueueFilters): Promise<Paged<QueueItem>> {
  const page = Math.max(1, f.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, f.pageSize ?? 25));
  const empty = { items: [], total: 0, page, pageSize };
  if (!hasPermission(user, 'requests.view') && !hasPermission(user, 'requests.view_all') && !hasPermission(user, 'requests.act')) return empty;
  const roleWhere = queueRoleWhere(user, f.roleId);
  if (!roleWhere) return empty;
  const tab = f.tab ?? 'active';
  const reqWhere: Prisma.RequestWhereInput = { status: { in: [...OPEN_STATUSES] } };
  if (f.from || f.to) {
    reqWhere.submittedAt = { ...(f.from ? { gte: new Date(f.from) } : {}), ...(f.to ? { lte: new Date(f.to) } : {}) };
  }
  if (f.submitterId) reqWhere.submitterId = f.submitterId;
  if (f.vehicleId) reqWhere.expense = { is: { vehicleId: f.vehicleId } };
  if (f.minAmount || f.maxAmount) {
    reqWhere.totalFinal = { ...(f.minAmount ? { gte: f.minAmount } : {}), ...(f.maxAmount ? { lte: f.maxAmount } : {}) };
  }
  const where: Prisma.RequestStepInstanceWhereInput = {
    AND: [
      roleWhere,
      { status: tab === 'awaiting' ? 'AWAITING_CORRECTION' : 'ACTIVE' },
      { request: reqWhere },
      ...(f.overdue ? [{ status: 'ACTIVE' as const, dueAt: { lt: new Date() } }] : []),
    ],
  };
  const [total, rows] = await Promise.all([
    db.requestStepInstance.count({ where }),
    db.requestStepInstance.findMany({
      where,
      orderBy: [{ activatedAt: 'asc' }, { id: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        request: {
          include: {
            submitter: { select: { fullName: true } },
            submittedByUser: { select: { fullName: true } },
            requestType: { select: { moduleKey: true } },
            lock: { include: { user: { select: { fullName: true } } } },
          },
        },
      },
    }),
  ]);
  const correctionUserIds = [...new Set(rows.map((r) => r.correctionRequestedById).filter((x): x is string => !!x))];
  const users = correctionUserIds.length
    ? await db.user.findMany({ where: { id: { in: correctionUserIds } }, select: { id: true, fullName: true } })
    : [];
  const userName = new Map(users.map((u) => [u.id, u.fullName]));
  const summaries = await summariesFor(db, rows.map((r) => ({ id: r.requestId, moduleKey: r.request.requestType.moduleKey })));
  const now = new Date();
  const items: QueueItem[] = rows.map((r) => ({
    id: r.requestId,
    number: r.request.number,
    status: r.request.status,
    submitterName: r.request.submitter?.fullName ?? r.request.submittedByUser?.fullName ?? null,
    summary: summaries[r.requestId] ?? {},
    totalFinal: r.request.totalFinal.toString(),
    submittedAt: r.request.submittedAt,
    step: {
      instanceId: r.id,
      nameAr: r.nameAr,
      nameEn: r.nameEn,
      roleId: r.roleId,
      activatedAt: r.activatedAt,
      dueAt: r.dueAt,
      overdue: r.status === 'ACTIVE' && !!r.dueAt && r.dueAt < now,
      ...(r.correctionRequestedById && (r.status === 'AWAITING_CORRECTION' || r.returnedAt)
        ? { returnedFor: userName.get(r.correctionRequestedById) }
        : {}),
    },
    ...(r.request.lock && r.request.lock.expiresAt > now
      ? { lock: { userId: r.request.lock.userId, userName: r.request.lock.user.fullName, expiresAt: r.request.lock.expiresAt } }
      : {}),
    hasDuplicateWarning: r.request.hasDuplicateWarning,
  }));
  return { items, total, page, pageSize };
}

export async function queueCounters(db: Db, user: AuthUser): Promise<QueueCounter[]> {
  const roles = user.roles.filter((r) => !r.isSuperUser);
  const now = new Date();
  const out: QueueCounter[] = [];
  for (const r of roles) {
    const base: Prisma.RequestStepInstanceWhereInput = {
      roleId: r.roleId,
      status: 'ACTIVE',
      request: { status: { in: [...OPEN_STATUSES] }, ...(r.scopeDepartmentId ? { departmentId: r.scopeDepartmentId } : {}) },
    };
    const [count, overdue] = await Promise.all([
      db.requestStepInstance.count({ where: base }),
      db.requestStepInstance.count({ where: { ...base, dueAt: { lt: now } } }),
    ]);
    out.push({ roleId: r.roleId, nameAr: r.nameAr, nameEn: r.nameEn, count, overdue });
  }
  return out;
}

// ------------------------------------------------------------------ lists
async function summariesFor(
  db: Db,
  items: { id: string; moduleKey: string | null }[],
): Promise<Record<string, Record<string, unknown>>> {
  const byModule = new Map<string, string[]>();
  for (const i of items) {
    if (!i.moduleKey) continue;
    byModule.set(i.moduleKey, [...(byModule.get(i.moduleKey) ?? []), i.id]);
  }
  const out: Record<string, Record<string, unknown>> = {};
  for (const [key, ids] of byModule) {
    const m = getModule(key);
    if (m?.listSummary) Object.assign(out, await m.listSummary(db, [...new Set(ids)]));
  }
  return out;
}

function parseSort(sort: string | undefined): Prisma.RequestOrderByWithRelationInput {
  const [field, dir] = (sort ?? 'submittedAt:desc').split(':');
  const d = dir === 'asc' ? 'asc' : 'desc';
  if (field === 'number') return { number: d };
  if (field === 'totalFinal') return { totalFinal: d };
  if (field === 'status') return { status: d };
  return { submittedAt: d };
}

export async function listRequests(db: Db, user: AuthUser, f: RequestFilters): Promise<Paged<RequestListItem>> {
  const page = Math.max(1, f.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, f.pageSize ?? 25));
  const vis = visibilityWhere(user);
  if (!vis) return { items: [], total: 0, page, pageSize };
  const and: Prisma.RequestWhereInput[] = [vis];
  if (f.status) {
    const st = f.status.split(',').filter(Boolean) as Prisma.EnumRequestStatusFilter['in'];
    and.push({ status: { in: st } });
  }
  if (f.number) and.push({ number: { contains: f.number, mode: 'insensitive' } });
  if (f.requestTypeId) and.push({ requestTypeId: f.requestTypeId });
  if (f.submitterId) and.push({ submitterId: f.submitterId });
  if (f.vehicleId) and.push({ expense: { is: { vehicleId: f.vehicleId } } });
  if (f.from) and.push({ submittedAt: { gte: new Date(f.from) } });
  if (f.to) and.push({ submittedAt: { lte: new Date(f.to) } });
  if (f.stepRoleId) {
    and.push({ stepInstances: { some: { roleId: f.stepRoleId, status: { in: ['ACTIVE', 'AWAITING_CORRECTION'] } } } });
  }
  const where: Prisma.RequestWhereInput = { AND: and };
  const [total, rows] = await Promise.all([
    db.request.count({ where }),
    db.request.findMany({
      where,
      orderBy: [parseSort(f.sort), { id: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        submitter: { select: { fullName: true } },
        submittedByUser: { select: { fullName: true } },
        requestType: { select: { moduleKey: true } },
      },
    }),
  ]);
  const summaries = await summariesFor(db, rows.map((r) => ({ id: r.id, moduleKey: r.requestType.moduleKey })));
  return {
    items: rows.map((r) => ({
      id: r.id,
      number: r.number,
      status: r.status,
      submitterName: r.submitter?.fullName ?? r.submittedByUser?.fullName ?? null,
      totalFinal: r.totalFinal.toString(),
      submittedAt: r.submittedAt,
      summary: summaries[r.id] ?? {},
    })),
    total,
    page,
    pageSize,
  };
}

export async function listSubmitterRequests(db: Db, submitterId: string, limit = 10) {
  const rows = await db.request.findMany({
    where: { submitterId },
    orderBy: { submittedAt: 'desc' },
    take: limit,
    include: { stepInstances: { where: { status: { in: ['ACTIVE', 'AWAITING_CORRECTION'] } }, select: { nameAr: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    number: r.number,
    status: r.status as string,
    totalFinal: r.totalFinal.toString(),
    submittedAt: r.submittedAt,
    currentSteps: r.stepInstances.map((s) => s.nameAr),
  }));
}

export type { OpenCorrection };

// ------------------------------------------------------------------ detail
export async function getRequestDetail(db: Db, requestId: string, viewer?: AuthUser): Promise<RequestDetail> {
  const req = await db.request.findUnique({
    where: { id: requestId },
    include: {
      requestType: true,
      submitter: { select: { id: true, code: true, fullName: true } },
      submittedByUser: { select: { id: true, fullName: true } },
      lines: {
        orderBy: { lineNo: 'asc' },
        include: {
          category: true,
          originalCategory: true,
          attachments: { orderBy: { createdAt: 'asc' } },
          edits: { orderBy: { createdAt: 'asc' }, include: { editedByUser: { select: { fullName: true } } } },
        },
      },
      stepInstances: {
        orderBy: [{ stageIndex: 'asc' }, { sortOrder: 'asc' }, { stepKey: 'asc' }],
        include: {
          workflowStep: true,
          actedBy: { select: { fullName: true } },
          onBehalfOf: { select: { fullName: true } },
          signature: { select: { storageKey: true } },
        },
      },
      correctionRequests: { orderBy: { createdAt: 'asc' }, include: { requestedBy: { select: { fullName: true } } } },
      events: { orderBy: { createdAt: 'asc' }, include: { actorUser: { select: { fullName: true } }, actorSubmitter: { select: { fullName: true } } } },
      lock: { include: { user: { select: { fullName: true } } } },
      documents: true,
    },
  });
  if (!req) throw new DomainError('NOT_FOUND', 'Request not found');

  const dupRows = await db.attachmentDuplicate.findMany({
    where: { requestId },
    include: { otherRequest: { select: { number: true } } },
  });
  const dupsByAtt = new Map<string, typeof dupRows>();
  for (const d of dupRows) dupsByAtt.set(d.attachmentId, [...(dupsByAtt.get(d.attachmentId) ?? []), d]);
  const correctorIds = [...new Set(req.stepInstances.map((s) => s.correctionRequestedById).filter((x): x is string => !!x))];
  const correctors = correctorIds.length
    ? await db.user.findMany({ where: { id: { in: correctorIds } }, select: { id: true, fullName: true } })
    : [];
  const corrName = new Map(correctors.map((u) => [u.id, u.fullName]));

  const mod = getModule(req.requestType.moduleKey);
  const moduleExtras = mod?.detailExtras ? await mod.detailExtras(db, requestId) : {};

  const now = new Date();
  let myActions: Record<string, unknown> | null = null;
  if (viewer && hasPermission(viewer, 'requests.act') && (OPEN_STATUSES as readonly string[]).includes(req.status)) {
    const inst = req.stepInstances.find(
      (i) =>
        i.status === 'ACTIVE' &&
        viewer.roles.some((r) => r.roleId === i.roleId && (r.scopeDepartmentId === null || r.scopeDepartmentId === req.departmentId)),
    );
    if (inst) {
      const st = inst.workflowStep;
      const cl = checklistSchema.safeParse(st.checklist);
      const actions = st.allowedActions;
      myActions = {
        stepInstanceId: inst.id,
        approve: actions.includes('APPROVE'),
        requestCorrection: actions.includes('REQUEST_CORRECTION'),
        sendBack: actions.includes('SEND_BACK') && req.stepInstances.some((x) => x.stageIndex < inst.stageIndex && x.status === 'APPROVED'),
        reject: actions.includes('REJECT'),
        editAmounts: st.canEditAmounts && hasPermission(viewer, 'requests.edit_amounts'),
        reclassify: st.canReclassify && hasPermission(viewer, 'requests.reclassify'),
        checklist: (cl.success ? cl.data : []) as ChecklistItem[],
        isPayment: inst.kind === 'PAYMENT',
      };
    }
  }
  const finalDoc = req.documents.find((d) => d.kind === 'FINAL');

  return {
    id: req.id,
    number: req.number,
    status: req.status,
    channel: req.channel,
    requestType: { id: req.requestType.id, code: req.requestType.code, nameAr: req.requestType.nameAr, nameEn: req.requestType.nameEn },
    submittedAt: iso(req.submittedAt),
    paidAt: iso(req.paidAt),
    rejectedAt: iso(req.rejectedAt),
    rejectionReason: req.rejectionReason,
    totals: { original: req.totalOriginal.toString(), final: req.totalFinal.toString(), currency: req.currency },
    submitter: req.submitter,
    submittedByUser: req.submittedByUser,
    headerValues: req.headerValues,
    module: moduleExtras,
    hasDuplicateWarning: req.hasDuplicateWarning,
    lines: req.lines.map((l) => ({
      id: l.id,
      lineNo: l.lineNo,
      category: { id: l.category.id, code: l.category.code, nameAr: l.categoryNameAr, nameEn: l.categoryNameEn },
      originalCategory: { id: l.originalCategory.id, code: l.originalCategory.code, nameAr: l.originalCategory.nameAr, nameEn: l.originalCategory.nameEn },
      originalAmount: l.originalAmount.toString(),
      amount: l.amount.toString(),
      isEdited: l.isEdited,
      extraValues: l.extraValues,
      quantity: l.quantity?.toString() ?? null,
      unitPrice: l.unitPrice?.toString() ?? null,
      lineDate: l.lineDate ? l.lineDate.toISOString().slice(0, 10) : null,
      note: l.note,
      warnings: l.warnings,
      attachments: l.attachments.map((a) => ({
        id: a.id,
        url: url(a.storageKey),
        thumbUrl: url(a.thumbKey),
        mimeType: a.mimeType,
        isCurrent: a.isCurrent,
        supersededById: a.supersededById,
        createdAt: iso(a.createdAt),
        duplicates: (dupsByAtt.get(a.id) ?? []).map((d) => ({
          otherRequestId: d.otherRequestId,
          otherRequestNumber: d.otherRequest.number,
          kind: d.kind,
          distance: d.distance,
        })),
      })),
      edits: l.edits.map((e) => ({
        id: e.id,
        source: e.source,
        field: e.field,
        oldValue: e.oldValue,
        newValue: e.newValue,
        oldLabel: e.oldLabel,
        newLabel: e.newLabel,
        reason: e.reason,
        editedByName: e.editedByUser?.fullName ?? null,
        createdAt: iso(e.createdAt),
      })),
    })),
    steps: req.stepInstances.map((s) => ({
      id: s.id,
      stepKey: s.stepKey,
      stageIndex: s.stageIndex,
      nameAr: s.nameAr,
      nameEn: s.nameEn,
      roleId: s.roleId,
      roleNameAr: s.roleNameAr,
      roleNameEn: s.roleNameEn,
      kind: s.kind,
      status: s.status,
      activatedAt: iso(s.activatedAt),
      dueAt: iso(s.dueAt),
      actedAt: iso(s.actedAt),
      actedByName: s.actedBy?.fullName ?? null,
      onBehalfOfName: s.onBehalfOf?.fullName ?? null,
      comment: s.comment,
      signatureUrl: url(s.signature?.storageKey),
      returnedAt: iso(s.returnedAt),
      correctionRequestedByName: s.correctionRequestedById ? (corrName.get(s.correctionRequestedById) ?? null) : null,
      showInSignatures: s.workflowStep.showInSignatures,
    })),
    currentStageIndex: req.currentStageIndex,
    corrections: req.correctionRequests.map((c) => ({
      id: c.id,
      stepInstanceId: c.stepInstanceId,
      lineId: c.lineId,
      attachmentId: c.attachmentId,
      reasonCode: c.reasonCode,
      fixType: c.fixType,
      comment: c.comment,
      status: c.status,
      requestedByName: c.requestedBy.fullName,
      createdAt: iso(c.createdAt),
      resolvedAt: iso(c.resolvedAt),
    })),
    events: req.events.map((e) => ({
      id: e.id,
      type: e.type,
      actorType: e.actorType,
      actorName: e.actorUser?.fullName ?? e.actorSubmitter?.fullName ?? null,
      stepInstanceId: e.stepInstanceId,
      lineId: e.lineId,
      attachmentId: e.attachmentId,
      comment: e.comment,
      data: e.data,
      createdAt: iso(e.createdAt),
    })),
    lock:
      req.lock && req.lock.expiresAt > now
        ? { userId: req.lock.userId, userName: req.lock.user.fullName, expiresAt: iso(req.lock.expiresAt) }
        : null,
    myActions,
    finalPdf: finalDoc ? { url: url(finalDoc.storageKey), sha256: finalDoc.sha256, lockedAt: iso(finalDoc.generatedAt) } : null,
    rowVersion: req.rowVersion,
  } as RequestDetail;
}
