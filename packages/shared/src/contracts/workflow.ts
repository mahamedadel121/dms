// Contract file owned by WP2: workflow / requests / templates / request-types API (PLAN section 11).
// Decimals are strings, dates ISO-8601 UTC strings in JSON.
import { z } from 'zod';
import {
  checklistItemSchema,
  conditionSchema,
  fieldDefinitionSchema,
  templateConfigSchema,
  type ChecklistItem,
  type Condition,
  type FieldDefinition,
  type TemplateConfig,
} from '../schemas';

// ---------------------------------------------------------------- common
export interface PagedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export const pageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  sort: z.string().optional(),
  q: z.string().optional(),
});

// ---------------------------------------------------------------- requests: lists
export const queueQuerySchema = z.object({
  tab: z.enum(['active', 'awaiting']).default('active'),
  roleId: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  submitterId: z.string().optional(),
  vehicleId: z.string().optional(),
  minAmount: z.string().optional(),
  maxAmount: z.string().optional(),
  overdue: z
    .union([z.boolean(), z.enum(['1', 'true', '0', 'false'])])
    .transform((v) => v === true || v === '1' || v === 'true')
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
});
export type QueueQuery = z.infer<typeof queueQuerySchema>;

export interface QueueItemDto {
  id: string;
  number: string;
  status: string;
  submitterName: string | null;
  summary: Record<string, unknown>; // expense: { vehicleNumber, vehicleTypeCode, costCenterCode ... }
  totalFinal: string;
  submittedAt: string;
  step: {
    instanceId: string;
    nameAr: string;
    nameEn: string;
    roleId: string;
    activatedAt: string | null;
    dueAt: string | null;
    overdue: boolean;
    returnedFor?: string;
  };
  lock?: { userId: string; userName: string; expiresAt: string };
  hasDuplicateWarning: boolean;
}
export interface QueueCounterDto {
  roleId: string;
  nameAr: string;
  nameEn: string;
  count: number;
  overdue: number;
}

export const requestListQuerySchema = z.object({
  status: z.string().optional(),
  number: z.string().optional(),
  requestTypeId: z.string().optional(),
  submitterId: z.string().optional(),
  vehicleId: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  stepRoleId: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  sort: z.string().optional(),
});
export type RequestListQuery = z.infer<typeof requestListQuerySchema>;

export interface RequestListItemDto {
  id: string;
  number: string;
  status: string;
  submitterName: string | null;
  totalFinal: string;
  submittedAt: string;
  summary: Record<string, unknown>;
}

// ---------------------------------------------------------------- requests: detail
export interface LineWarningDto {
  code: string;
  messageAr: string;
  messageEn: string;
}
export interface AttachmentDto {
  id: string;
  url: string;
  thumbUrl: string | null;
  mimeType: string;
  isCurrent: boolean;
  supersededById: string | null;
  createdAt: string;
  duplicates: { otherRequestId: string; otherRequestNumber: string; kind: 'EXACT' | 'NEAR'; distance: number }[];
}
export interface LineEditDto {
  id: string;
  source: 'APPROVER' | 'SUBMITTER_CORRECTION';
  field: string;
  oldValue: string | null;
  newValue: string | null;
  oldLabel: string | null;
  newLabel: string | null;
  reason: string;
  editedByName: string | null;
  createdAt: string;
}
export interface RequestLineDto {
  id: string;
  lineNo: number;
  category: { id: string; code: string; nameAr: string; nameEn: string };
  originalCategory: { id: string; code: string; nameAr: string; nameEn: string };
  originalAmount: string;
  amount: string;
  isEdited: boolean;
  extraValues: Record<string, string>;
  quantity: string | null;
  unitPrice: string | null;
  lineDate: string | null;
  note: string | null;
  warnings: LineWarningDto[];
  attachments: AttachmentDto[];
  edits: LineEditDto[];
}
export type StepInstanceStatusDto =
  | 'PENDING'
  | 'ACTIVE'
  | 'AWAITING_CORRECTION'
  | 'APPROVED'
  | 'NOT_APPLICABLE'
  | 'REJECTED'
  | 'CANCELLED';
export interface RequestStepDto {
  id: string;
  stepKey: string;
  stageIndex: number;
  nameAr: string;
  nameEn: string;
  roleId: string;
  roleNameAr: string;
  roleNameEn: string;
  kind: 'APPROVAL' | 'PAYMENT';
  status: StepInstanceStatusDto;
  activatedAt: string | null;
  dueAt: string | null;
  actedAt: string | null;
  actedByName: string | null;
  onBehalfOfName: string | null;
  comment: string | null;
  signatureUrl: string | null;
  returnedAt: string | null;
  correctionRequestedByName: string | null;
  showInSignatures: boolean;
}
export interface CorrectionDto {
  id: string;
  stepInstanceId: string;
  lineId: string | null;
  attachmentId: string | null;
  reasonCode: string;
  fixType: 'REUPLOAD' | 'AMOUNT' | 'BOTH';
  comment: string;
  status: 'OPEN' | 'RESOLVED' | 'CANCELLED';
  requestedByName: string | null;
  createdAt: string;
  resolvedAt: string | null;
}
export interface RequestEventDto {
  id: string;
  type: string;
  actorType: 'USER' | 'SUBMITTER' | 'SYSTEM';
  actorName: string | null;
  stepInstanceId: string | null;
  lineId: string | null;
  attachmentId: string | null;
  comment: string | null;
  data: unknown;
  createdAt: string;
}
export interface MyActionsDto {
  stepInstanceId: string;
  approve: boolean;
  requestCorrection: boolean;
  sendBack: boolean;
  reject: boolean;
  editAmounts: boolean;
  reclassify: boolean;
  checklist: ChecklistItem[];
  isPayment: boolean;
}
export interface RequestDetailDto {
  id: string;
  number: string;
  status: 'IN_REVIEW' | 'CORRECTION_REQUESTED' | 'APPROVED' | 'PAID' | 'REJECTED' | 'CANCELLED';
  channel: 'TELEGRAM' | 'WEB';
  requestType: { id: string; code: string; nameAr: string; nameEn: string };
  submittedAt: string;
  paidAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  totals: { original: string; final: string; currency: string };
  submitter: { id: string; code: string; fullName: string } | null;
  submittedByUser: { id: string; fullName: string } | null;
  headerValues: Record<string, unknown>;
  module: Record<string, unknown>;
  hasDuplicateWarning: boolean;
  lines: RequestLineDto[];
  steps: RequestStepDto[];
  currentStageIndex: number | null;
  corrections: CorrectionDto[];
  events: RequestEventDto[];
  lock: { userId: string; userName: string; expiresAt: string } | null;
  myActions: MyActionsDto | null;
  finalPdf: { url: string; sha256: string; lockedAt: string } | null;
  rowVersion: number;
}

// ---------------------------------------------------------------- requests: actions / lock / submit
export const approveBodySchema = z.object({
  comment: z.string().optional(),
  checklist: z.record(z.boolean()).optional(),
  actionData: z.record(z.unknown()).optional(), // treasury: { treasuryId? }
});
export type ApproveBody = z.infer<typeof approveBodySchema>;

export const correctionItemSchema = z
  .object({
    lineId: z.string().optional(),
    attachmentId: z.string().optional(),
    reasonCode: z.enum(['IMAGE_UNCLEAR', 'WRONG_AMOUNT', 'MISSING_IMAGE', 'OTHER']),
    fixType: z.enum(['REUPLOAD', 'AMOUNT', 'BOTH']),
    comment: z.string().trim().min(1),
  })
  .refine((v) => !!v.lineId || !!v.attachmentId, { message: 'lineId or attachmentId required' });
export const requestCorrectionBodySchema = z.object({ items: z.array(correctionItemSchema).min(1) });
export type RequestCorrectionBody = z.infer<typeof requestCorrectionBodySchema>;

export const sendBackBodySchema = z.object({ comment: z.string().trim().min(1) });
export const rejectBodySchema = z.object({ reason: z.string().trim().min(1) });
export const editLineBodySchema = z.object({
  stepInstanceId: z.string(),
  amount: z.string().optional(),
  categoryId: z.string().optional(),
  extraValues: z.record(z.string()).optional(),
  reason: z.string().trim().min(1),
});
export type EditLineBody = z.infer<typeof editLineBodySchema>;

export const submitRequestBodySchema = z.object({
  requestTypeCode: z.string().min(1),
  clientKey: z.string().max(200).optional(),
  submitterId: z.string().optional(),
  headerValues: z.record(z.unknown()).default({}),
  lines: z
    .array(
      z.object({
        categoryId: z.string(),
        amount: z.string(),
        extraValues: z.record(z.string()).optional(),
        attachmentIds: z.array(z.string()).default([]),
        lineDate: z.string().optional(),
        note: z.string().optional(),
      }),
    )
    .min(1),
});
export type SubmitRequestBody = z.infer<typeof submitRequestBodySchema>;

export interface LockInfoDto {
  requestId: string;
  userId: string;
  userName: string;
  acquiredAt: string;
  expiresAt: string;
}

// ---------------------------------------------------------------- request types
export const requestTypeInputSchema = z.object({
  code: z.string().min(1).max(40).regex(/^[A-Z0-9_]+$/),
  nameAr: z.string().min(1),
  nameEn: z.string().min(1),
  departmentId: z.string().nullable().optional(),
  numberPrefix: z.string().min(1).max(4).regex(/^[A-Z0-9]+$/),
  moduleKey: z.string().nullable().optional(),
  headerFields: z.array(fieldDefinitionSchema).default([]),
  hasLines: z.boolean().default(true),
  channels: z.array(z.enum(['TELEGRAM', 'WEB'])).default(['TELEGRAM']),
  settings: z.record(z.unknown()).default({}),
  isActive: z.boolean().default(true),
});
export type RequestTypeInput = z.infer<typeof requestTypeInputSchema>;
export const requestTypeUpdateSchema = requestTypeInputSchema.partial().omit({ code: true, numberPrefix: true });

export const lineCategoryInputSchema = z.object({
  code: z.string().min(1).max(40),
  nameAr: z.string().min(1),
  nameEn: z.string().min(1),
  icon: z.string().nullable().optional(),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
  extraFields: z.array(fieldDefinitionSchema).default([]),
  quantityFieldKey: z.string().nullable().optional(),
  unitPriceMin: z.string().nullable().optional(),
  unitPriceMax: z.string().nullable().optional(),
  minAttachments: z.number().int().min(0).default(1),
  maxAttachments: z.number().int().min(0).default(10),
  maxAmountWarning: z.string().nullable().optional(),
  approvalRoleIds: z.array(z.string()).default([]),
});
export type LineCategoryInput = z.infer<typeof lineCategoryInputSchema>;
export const lineCategoryUpdateSchema = lineCategoryInputSchema.partial().omit({ code: true });

export interface LineCategoryDto {
  id: string;
  requestTypeId: string;
  code: string;
  nameAr: string;
  nameEn: string;
  icon: string | null;
  sortOrder: number;
  isActive: boolean;
  extraFields: FieldDefinition[];
  quantityFieldKey: string | null;
  unitPriceMin: string | null;
  unitPriceMax: string | null;
  minAttachments: number;
  maxAttachments: number;
  maxAmountWarning: string | null;
  approvalRoleIds: string[];
}
export interface RequestTypeDto {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  departmentId: string | null;
  numberPrefix: string;
  moduleKey: string | null;
  headerFields: FieldDefinition[];
  hasLines: boolean;
  channels: string[];
  settings: Record<string, unknown>;
  isActive: boolean;
  workflowId: string | null;
  lineCategories?: LineCategoryDto[];
}

// ---------------------------------------------------------------- workflows
export const stepInputSchema = z.object({
  key: z.string().min(1).regex(/^[a-z0-9_]+$/),
  stepType: z.enum(['ROLE', 'DYNAMIC_CATEGORY_ROLES']).default('ROLE'),
  kind: z.enum(['APPROVAL', 'PAYMENT']).default('APPROVAL'),
  nameAr: z.string().min(1),
  nameEn: z.string().min(1),
  roleId: z.string().nullable().optional(),
  parallelGroup: z.string().nullable().optional(),
  condition: conditionSchema.default({ type: 'ALWAYS' }),
  allowedActions: z
    .array(z.enum(['APPROVE', 'REQUEST_CORRECTION', 'SEND_BACK', 'REJECT']))
    .default(['APPROVE', 'REQUEST_CORRECTION', 'SEND_BACK', 'REJECT']),
  canEditAmounts: z.boolean().default(false),
  canReclassify: z.boolean().default(false),
  checklist: z.array(checklistItemSchema).default([]),
  slaHours: z.number().int().min(1).nullable().optional(),
  showInSignatures: z.boolean().default(true),
});
export type StepInput = z.infer<typeof stepInputSchema>;

export const saveWorkflowVersionBodySchema = z.object({
  note: z.string().nullable().optional(),
  steps: z.array(stepInputSchema),
});
export type SaveWorkflowVersionBody = z.infer<typeof saveWorkflowVersionBodySchema>;
export const createVersionBodySchema = z.object({ basedOnVersionId: z.string().optional() });
export const simulateBodySchema = z.object({
  categoryIds: z.array(z.string()),
  totalAmount: z.string().default('0'),
  header: z.record(z.unknown()).optional(),
  module: z.record(z.unknown()).optional(),
});
export type SimulateBody = z.infer<typeof simulateBodySchema>;

export interface WorkflowStepDto extends Omit<StepInput, 'condition'> {
  id: string;
  sortOrder: number;
  roleName: string | null;
  condition: Condition;
}
export interface WorkflowVersionDto {
  id: string;
  workflowId: string;
  version: number;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  note: string | null;
  createdAt: string;
  publishedAt: string | null;
  steps?: WorkflowStepDto[];
}
export interface WorkflowDto {
  id: string;
  requestTypeId: string;
  requestTypeCode: string;
  nameAr: string;
  nameEn: string;
  isActive: boolean;
  versions?: WorkflowVersionDto[];
}

// ---------------------------------------------------------------- templates
export const templateVersionBodySchema = z.object({
  config: templateConfigSchema.optional(),
  layoutKey: z.string().optional(),
  note: z.string().nullable().optional(),
});
export type TemplateVersionBody = z.infer<typeof templateVersionBodySchema>;
export interface TemplateVersionDto {
  id: string;
  templateId: string;
  version: number;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  layoutKey: string;
  config: TemplateConfig;
  note: string | null;
  createdAt: string;
  publishedAt: string | null;
}
export interface TemplateDto {
  id: string;
  requestTypeId: string;
  code: string;
  nameAr: string;
  nameEn: string;
  isDefault: boolean;
  isActive: boolean;
  versions?: TemplateVersionDto[];
}
export type SendBackBody = z.infer<typeof sendBackBodySchema>;
export type RejectBody = z.infer<typeof rejectBodySchema>;
