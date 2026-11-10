import type { PrismaClient, Request, RequestLine } from '@prisma/client';
import type { AuthUser, Condition, ConditionFacts } from '@dms/shared';
import type { Db, Actor } from '../common';
import { DomainError } from '../errors';

// TODO(WP2): everything in this file. Signatures follow PLAN section 4 exactly.

export interface SubmitRequestInput {
  requestTypeCode: string;
  channel: 'TELEGRAM' | 'WEB';
  submitterId?: string;
  submittedByUserId?: string;
  clientKey?: string;
  headerValues: Record<string, unknown>;
  lines: {
    categoryId: string;
    amount: string;
    extraValues?: Record<string, string>;
    attachmentIds: string[];
    lineDate?: string;
    note?: string;
  }[];
}

export interface ActionCtx {
  requestId: string;
  stepInstanceId: string;
  user: AuthUser;
  actionData?: Record<string, unknown>;
  actor: Actor;
}
export interface LineWarning {
  code: string;
  messageAr: string;
  messageEn: string;
}
export interface TemplateModuleData {
  headerValues: { key: string; value: string }[];
  lineExtras?: Record<string, Record<string, string>>;
}

export interface RequestModule {
  key: string;
  validateSubmission?(db: Db, input: SubmitRequestInput): Promise<void>;
  afterCreate?(tx: Db, req: Request, lines: RequestLine[], input: SubmitRequestInput): Promise<void>;
  conditionFacts?(db: Db, requestId: string): Promise<Record<string, unknown>>;
  onLineChanged?(tx: Db, req: Request, line: RequestLine, changed: string[]): Promise<void>;
  lineWarnings?(db: Db, line: RequestLine): Promise<LineWarning[]>;
  beforeApprove?(tx: Db, ctx: ActionCtx): Promise<void>;
  onPaid?(tx: Db, req: Request, ctx: ActionCtx): Promise<void>;
  onCompleted?(tx: Db, req: Request): Promise<void>;
  onRejected?(tx: Db, req: Request): Promise<void>;
  detailExtras?(db: Db, requestId: string): Promise<Record<string, unknown>>;
  templateData?(db: Db, requestId: string): Promise<TemplateModuleData>;
  listSummary?(db: Db, requestIds: string[]): Promise<Record<string, Record<string, unknown>>>;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
export interface LockInfo {
  requestId: string;
  userId: string;
  userName: string;
  acquiredAt: Date;
  expiresAt: Date;
}
export interface QueueFilters {
  tab?: 'active' | 'awaiting';
  roleId?: string;
  from?: string;
  to?: string;
  submitterId?: string;
  vehicleId?: string;
  minAmount?: string;
  maxAmount?: string;
  overdue?: boolean;
  page?: number;
  pageSize?: number;
}
export interface RequestFilters {
  status?: string;
  number?: string;
  requestTypeId?: string;
  submitterId?: string;
  vehicleId?: string;
  from?: string;
  to?: string;
  stepRoleId?: string;
  page?: number;
  pageSize?: number;
  sort?: string;
}
export interface QueueItem {
  id: string;
  number: string;
  status: string;
  submitterName: string | null;
  summary: Record<string, unknown>;
  totalFinal: string;
  submittedAt: Date;
  step: {
    instanceId: string;
    nameAr: string;
    nameEn: string;
    roleId: string;
    activatedAt: Date | null;
    dueAt: Date | null;
    overdue: boolean;
    returnedFor?: string;
  };
  lock?: { userId: string; userName: string; expiresAt: Date };
  hasDuplicateWarning: boolean;
}
export interface QueueCounter {
  roleId: string;
  nameAr: string;
  nameEn: string;
  count: number;
  overdue: number;
}
export interface RequestListItem {
  id: string;
  number: string;
  status: string;
  submitterName: string | null;
  totalFinal: string;
  submittedAt: Date;
  summary: Record<string, unknown>;
}
/** Full shape documented in PLAN section 11 (GET /requests/:id). */
export type RequestDetail = Record<string, unknown> & { id: string; number: string; status: string };
export interface OpenCorrection {
  id: string;
  requestId: string;
  requestNumber: string;
  lineId: string | null;
  attachmentId: string | null;
  reasonCode: string;
  fixType: 'REUPLOAD' | 'AMOUNT' | 'BOTH';
  comment: string;
}

const ni = (n: string): never => {
  throw new DomainError('NOT_IMPLEMENTED', `${n} is not implemented yet (WP2)`);
};

export function registerModule(_m: RequestModule): void {
  ni('registerModule');
}
export async function submitRequest(
  _prisma: PrismaClient,
  _input: SubmitRequestInput,
  _actor: Actor,
): Promise<{ id: string; number: string }> {
  return ni('submitRequest');
}
export async function getRequestDetail(_db: Db, _requestId: string, _viewer?: AuthUser): Promise<RequestDetail> {
  return ni('getRequestDetail');
}
export async function listQueue(_db: Db, _user: AuthUser, _f: QueueFilters): Promise<Paged<QueueItem>> {
  return ni('listQueue');
}
export async function queueCounters(_db: Db, _user: AuthUser): Promise<QueueCounter[]> {
  return ni('queueCounters');
}
export async function listRequests(_db: Db, _user: AuthUser, _f: RequestFilters): Promise<Paged<RequestListItem>> {
  return ni('listRequests');
}
export async function canViewRequest(_db: Db, _user: AuthUser, _requestId: string): Promise<boolean> {
  return ni('canViewRequest');
}
export async function listSubmitterRequests(
  _db: Db,
  _submitterId: string,
  _limit?: number,
): Promise<{ id: string; number: string; status: string; totalFinal: string; submittedAt: Date; currentSteps: string[] }[]> {
  return ni('listSubmitterRequests');
}
export async function acquireLock(_prisma: PrismaClient, _requestId: string, _user: AuthUser): Promise<LockInfo> {
  return ni('acquireLock');
}
export async function releaseLock(
  _prisma: PrismaClient,
  _requestId: string,
  _user: AuthUser,
  _force?: boolean,
): Promise<void> {
  return ni('releaseLock');
}
export async function heartbeatLock(_prisma: PrismaClient, _requestId: string, _user: AuthUser): Promise<LockInfo> {
  return ni('heartbeatLock');
}
export async function approveStep(
  _prisma: PrismaClient,
  _a: {
    requestId: string;
    stepInstanceId: string;
    user: AuthUser;
    comment?: string;
    checklist?: Record<string, boolean>;
    actionData?: Record<string, unknown>;
    actor: Actor;
  },
): Promise<void> {
  return ni('approveStep');
}
export async function requestCorrection(
  _prisma: PrismaClient,
  _a: {
    requestId: string;
    stepInstanceId: string;
    user: AuthUser;
    items: { lineId?: string; attachmentId?: string; reasonCode: string; fixType: string; comment: string }[];
    actor: Actor;
  },
): Promise<void> {
  return ni('requestCorrection');
}
export async function sendBack(
  _prisma: PrismaClient,
  _a: { requestId: string; stepInstanceId: string; user: AuthUser; comment: string; actor: Actor },
): Promise<void> {
  return ni('sendBack');
}
export async function rejectRequest(
  _prisma: PrismaClient,
  _a: { requestId: string; stepInstanceId: string; user: AuthUser; reason: string; actor: Actor },
): Promise<void> {
  return ni('rejectRequest');
}
export async function editLine(
  _prisma: PrismaClient,
  _a: {
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
  return ni('editLine');
}
export async function listOpenCorrections(_db: Db, _submitterId: string): Promise<OpenCorrection[]> {
  return ni('listOpenCorrections');
}
export async function submitCorrection(
  _prisma: PrismaClient,
  _a: { correctionRequestId: string; submitterId: string; newAttachmentIds?: string[]; newAmount?: string },
): Promise<{ returnedToStep: boolean }> {
  return ni('submitCorrection');
}
export function evaluateCondition(_c: Condition, _facts: ConditionFacts): boolean {
  return ni('evaluateCondition');
}
export async function simulateWorkflow(
  _db: Db,
  _versionId: string,
  _sample: {
    categoryIds: string[];
    totalAmount: string;
    header?: Record<string, unknown>;
    module?: Record<string, unknown>;
  },
): Promise<{ stepKey: string; applies: boolean }[]> {
  return ni('simulateWorkflow');
}
export async function createDraftVersion(_prisma: PrismaClient, _workflowId: string, _basedOnVersionId?: string, _actor?: Actor): Promise<{ id: string }> {
  return ni('createDraftVersion');
}
export async function saveDraftVersion(_prisma: PrismaClient, _versionId: string, _input: { note?: string; steps: unknown[] }, _actor?: Actor): Promise<void> {
  return ni('saveDraftVersion');
}
export async function publishWorkflowVersion(_prisma: PrismaClient, _versionId: string, _actor?: Actor): Promise<void> {
  return ni('publishWorkflowVersion');
}
