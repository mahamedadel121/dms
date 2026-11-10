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

export type { VehicleChangeRow, PagedResult } from '@dms/shared';
export type {
  ReportRowDto,
  ReportResultDto,
  ReportGroupDto,
  ReportFiltersDto,
  ExportInfoDto,
  DashboardSummaryDto,
  DelayedItemDto,
} from '@dms/shared';
export type {
  SapPostingListItem,
  SapPostingList,
  SapPostingDetail,
  SapPostingAttemptDto,
  SapPostingStatusValue,
} from '@dms/shared';
