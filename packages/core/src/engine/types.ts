import type { Request, RequestLine } from '@prisma/client';
import type { AuthUser } from '@dms/shared';
import type { Db, Actor } from '../common';

// Public engine types (PLAN section 4).

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


export interface SimulateSample {
  categoryIds: string[];
  totalAmount: string;
  header?: Record<string, unknown>;
  module?: Record<string, unknown>;
}
