// Local response shapes for WP7 screens, taken from docs/PLAN.md section 11.
// Swap to `@dms/shared` contract types once WP2/WP5 export them (see CONTRACT_NOTES).
import type { ChecklistItem, Condition } from '@dms/shared';

export type { ChecklistItem, Condition };

export type RequestStatus = 'IN_REVIEW' | 'CORRECTION_REQUESTED' | 'APPROVED' | 'PAID' | 'REJECTED' | 'CANCELLED';
export type StepStatus = 'PENDING' | 'ACTIVE' | 'AWAITING_CORRECTION' | 'APPROVED' | 'NOT_APPLICABLE' | 'REJECTED' | 'CANCELLED';

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface LookupItem {
  id: string;
  code: string;
  label: string;
}

export interface QueueItem {
  id: string;
  number: string;
  status: RequestStatus;
  submitterName: string;
  summary?: { vehicleNumber?: string | null; [k: string]: unknown };
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
    returnedFor?: string | null;
  };
  lock?: { userId: string; userName: string; expiresAt: string } | null;
  hasDuplicateWarning?: boolean;
}

export interface QueueCounter {
  roleId: string;
  nameAr: string;
  nameEn: string;
  count: number;
  overdue: number;
}

export interface DuplicateRef {
  otherRequestId: string;
  otherRequestNumber: string;
  kind: 'EXACT' | 'NEAR' | string;
  distance?: number | null;
}

export interface AttachmentDto {
  id: string;
  url: string;
  thumbUrl?: string | null;
  mimeType: string;
  isCurrent: boolean;
  supersededById?: string | null;
  createdAt: string;
  duplicates?: DuplicateRef[];
}

export interface LineEditDto {
  id?: string;
  field: string;
  oldValue: unknown;
  newValue: unknown;
  reason?: string | null;
  source?: string;
  byName?: string | null;
  createdAt?: string;
}

export interface LineCategoryRef {
  id: string;
  code?: string;
  nameAr: string;
  nameEn?: string;
}

export interface LineDto {
  id: string;
  lineNo: number;
  category: LineCategoryRef | string;
  originalCategory?: LineCategoryRef | string | null;
  originalAmount: string;
  amount: string;
  isEdited: boolean;
  extraValues?: Record<string, unknown> | null;
  quantity?: string | null;
  unitPrice?: string | null;
  warnings?: Array<string | { code: string; message?: string; [k: string]: unknown }>;
  attachments: AttachmentDto[];
  edits?: LineEditDto[];
}

export interface StepDto {
  id: string;
  stepKey: string;
  stageIndex: number;
  nameAr: string;
  nameEn?: string;
  roleNameAr?: string;
  roleNameEn?: string;
  status: StepStatus;
  activatedAt?: string | null;
  dueAt?: string | null;
  actedAt?: string | null;
  actedByName?: string | null;
  onBehalfOfName?: string | null;
  comment?: string | null;
  signatureUrl?: string | null;
}

export interface CorrectionDto {
  id: string;
  status: 'OPEN' | 'RESOLVED' | 'CANCELLED' | string;
  comment?: string | null;
  lineId?: string | null;
  attachmentId?: string | null;
  kind?: string;
  requestedByName?: string | null;
  createdAt?: string;
}

export interface EventDto {
  id: string;
  type: string;
  actorName?: string | null;
  createdAt: string;
  comment?: string | null;
  data?: Record<string, unknown> | null;
  stepName?: string | null;
}

export interface MyActions {
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

export interface RequestDetail {
  id: string;
  number: string;
  status: RequestStatus;
  channel?: string;
  submittedAt: string;
  paidAt?: string | null;
  totals?: { original?: string; final?: string; totalOriginal?: string; totalFinal?: string; [k: string]: unknown };
  submitter?: { id?: string; name?: string; fullName?: string; code?: string } | null;
  headerValues?: Record<string, unknown> | null;
  module?: {
    vehicleNumber?: string | null;
    vehicleTypeName?: string | null;
    costCenterCode?: string | null;
    odometer?: string | number | null;
    lastOdometer?: string | number | null;
    [k: string]: unknown;
  } | null;
  lines: LineDto[];
  steps: StepDto[];
  corrections?: CorrectionDto[];
  events?: EventDto[];
  lock?: { userId: string; userName: string; expiresAt: string } | null;
  myActions: MyActions | null;
  finalPdf: { url: string; sha256: string; lockedAt: string } | null;
}

export interface RequestListItem {
  id: string;
  number: string;
  status: RequestStatus;
  submitterName?: string;
  vehicleNumber?: string | null;
  totalFinal?: string;
  submittedAt: string;
  currentStepName?: string | null;
}

export interface TreasuryLookup extends LookupItem {}

// ---------- workflows ----------
export interface WorkflowListItem {
  id: string;
  code?: string;
  nameAr?: string;
  nameEn?: string;
  name?: string;
  requestTypeId?: string;
  activeVersionId?: string | null;
  draftVersionId?: string | null;
}

export interface WorkflowVersionListItem {
  id: string;
  version: number;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  note?: string | null;
  publishedAt?: string | null;
  createdAt?: string;
}

export interface WorkflowDetail extends WorkflowListItem {
  versions: WorkflowVersionListItem[];
}

export type StepKind = 'ROLE' | 'PAYMENT' | 'DYNAMIC_CATEGORY_ROLES';

export interface StepInput {
  key: string;
  nameAr: string;
  nameEn: string;
  kind: StepKind;
  roleId: string | null;
  parallelGroup: string | null;
  condition: Condition;
  slaHours: number | null;
  allowedActions: string[];
  canEditAmounts: boolean;
  canReclassify: boolean;
  checklist: ChecklistItem[];
}

export interface WorkflowVersionDetail extends WorkflowVersionListItem {
  workflowId?: string;
  steps: Array<StepInput & { id?: string; position?: number }>;
}

export interface SimulateResult {
  steps?: Array<{ key: string; nameAr?: string; nameEn?: string; applicable: boolean }>;
  [k: string]: unknown;
}

// ---------- templates ----------
export interface TemplateListItem {
  id: string;
  code?: string;
  nameAr?: string;
  nameEn?: string;
  name?: string;
  requestTypeId?: string;
  activeVersionId?: string | null;
  draftVersionId?: string | null;
}
export interface TemplateVersionDto {
  id: string;
  version: number;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  layoutKey?: string | null;
  config: unknown;
  publishedAt?: string | null;
}
export interface TemplateDetail extends TemplateListItem {
  versions: TemplateVersionDto[];
}

// ---------- vehicle changes ----------
export interface VehicleChangeRequest {
  id: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | string;
  submitterName?: string;
  submitter?: { fullName?: string; name?: string } | null;
  currentVehicleNumber?: string | null;
  currentVehicle?: { vehicleNumber?: string } | null;
  requestedVehicleNumber?: string | null;
  requestedVehicle?: { vehicleNumber?: string } | null;
  reason?: string | null;
  note?: string | null;
  createdAt: string;
  decidedAt?: string | null;
  decidedByName?: string | null;
  decisionComment?: string | null;
}

// ---------- reports ----------
export type DateField = 'submittedAt' | 'paidAt' | 'lineDate';
export type GroupBy = 'driver' | 'vehicle' | 'expenseType' | 'gl' | 'costCenter' | 'month';
export interface ReportFilters {
  dateField: DateField;
  from?: string;
  to?: string;
  submitterIds?: string[];
  vehicleIds?: string[];
  vehicleTypeIds?: string[];
  costCenterIds?: string[];
  categoryIds?: string[];
  glAccountIds?: string[];
  statuses?: string[];
  stepRoleIds?: string[];
  number?: string;
  minAmount?: string;
  maxAmount?: string;
}
export interface ReportRow {
  requestId?: string;
  requestNumber?: string;
  submittedAt?: string;
  paidAt?: string | null;
  driverName?: string;
  vehicleNumber?: string;
  costCenter?: string;
  expenseType?: string;
  glAccount?: string;
  originalAmount?: string;
  finalAmount?: string;
  liters?: string | null;
  pricePerLiter?: string | null;
  odometer?: string | number | null;
  sapDocNumber?: string | null;
  imageCount?: number;
  [k: string]: unknown;
}
export interface ReportResult {
  rows: ReportRow[];
  groups?: Array<{ key: string; label: string; count: number; originalTotal: string; finalTotal: string }>;
  totals?: { count?: number; originalTotal?: string; finalTotal?: string; [k: string]: unknown };
  total?: number;
}
export type ExportKind = 'EXCEL' | 'ZIP_IMAGES' | 'PDF_BUNDLE';
export interface ExportJob {
  id: string;
  kind?: string;
  status: 'QUEUED' | 'PENDING' | 'RUNNING' | 'DONE' | 'READY' | 'FAILED' | string;
  fileName?: string | null;
  downloadUrl?: string | null;
  createdAt?: string;
  error?: string | null;
}

// ---------- dashboard ----------
export interface DashboardSummary {
  byPeriod?: Array<{ period: string; count?: number; total: string }>;
  byVehicle?: Array<{ vehicleNumber?: string; label?: string; total: string; count?: number }>;
  byExpenseType?: Array<{ label?: string; nameAr?: string; code?: string; total: string; count?: number }>;
  topVehicles?: Array<{ vehicleNumber?: string; label?: string; total: string; count?: number }>;
  avgApprovalHoursByStep?: Array<{ stepName?: string; nameAr?: string; hours: number | string }>;
  delayedByRole?: Array<{ roleName?: string; nameAr?: string; count: number }>;
}
