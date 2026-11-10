// Local response shapes for WP7 screens, taken from docs/PLAN.md section 11.
// Swap to `@dms/shared` contract types once WP2/WP5 export them (see CONTRACT_NOTES).
import type { ChecklistItem, Condition } from '@dms/shared';

export type { ChecklistItem, Condition };

export type {
  QueueItemDto as QueueItem,
  QueueCounterDto as QueueCounter,
  RequestDetailDto as RequestDetail,
  RequestListItemDto as RequestListItem,
  RequestLineDto as LineDto,
  RequestStepDto as StepDto,
  AttachmentDto,
  CorrectionDto,
  RequestEventDto as EventDto,
  MyActionsDto as MyActions,
  PagedResult as Paged,
  WorkflowDto,
  WorkflowVersionDto,
  WorkflowStepDto,
  StepInput,
  TemplateDto,
  TemplateVersionDto,
} from '@dms/shared';

export type RequestStatus = 'IN_REVIEW' | 'CORRECTION_REQUESTED' | 'APPROVED' | 'PAID' | 'REJECTED' | 'CANCELLED';
export type StepStatus =
  | 'PENDING'
  | 'ACTIVE'
  | 'AWAITING_CORRECTION'
  | 'APPROVED'
  | 'NOT_APPLICABLE'
  | 'REJECTED'
  | 'CANCELLED';

export interface LookupItem {
  id: string;
  code: string;
  label: string;
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
