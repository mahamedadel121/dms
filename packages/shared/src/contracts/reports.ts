// Contract file owned by WP5 (reports / exports / files / dashboard). PLAN §11, REQUIREMENTS §8.
// Decimals travel as strings ("1250.50"), dates as ISO strings (UTC; `lineDate` is a plain YYYY-MM-DD).
import { z } from 'zod';

const ids = z.array(z.string().min(1)).max(500).optional();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/, 'Expected YYYY-MM-DD or ISO date');
const money = z.string().regex(/^\d+(\.\d{1,2})?$/, 'Expected a decimal string');

export const REPORT_DATE_FIELDS = ['submittedAt', 'paidAt', 'lineDate'] as const;
export const REPORT_GROUP_BY = ['driver', 'vehicle', 'expenseType', 'gl', 'costCenter', 'month'] as const;
export const EXPORT_KINDS = ['EXCEL', 'ZIP_IMAGES', 'PDF_BUNDLE'] as const;

/** `from`/`to` are inclusive calendar days in Africa/Cairo when given as YYYY-MM-DD. */
export const reportFiltersSchema = z.object({
  dateField: z.enum(REPORT_DATE_FIELDS).default('submittedAt'),
  from: isoDate.optional(),
  to: isoDate.optional(),
  submitterIds: ids, // drivers
  vehicleIds: ids,
  vehicleTypeIds: ids,
  costCenterIds: ids,
  categoryIds: ids, // expense types
  glAccountIds: ids,
  statuses: z.array(z.enum(['IN_REVIEW', 'CORRECTION_REQUESTED', 'APPROVED', 'PAID', 'REJECTED', 'CANCELLED'])).optional(),
  stepRoleIds: ids, // requests currently waiting at one of these roles
  number: z.string().max(32).optional(), // substring match on request number
  minAmount: money.optional(), // on the final line amount
  maxAmount: money.optional(),
});
export type ReportFiltersDto = z.infer<typeof reportFiltersSchema>;

export const reportQuerySchema = z.object({
  filters: reportFiltersSchema,
  groupBy: z.enum(REPORT_GROUP_BY).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(500).default(50),
});
export type ReportQueryDto = z.infer<typeof reportQuerySchema>;

export interface ReportApprover {
  roleNameAr: string;
  roleNameEn: string;
  userName: string | null;
  actedAt: string | null;
}

/** One row per request line (REQUIREMENTS §8 columns). */
export interface ReportRowDto {
  lineId: string;
  lineNo: number;
  requestId: string;
  requestNumber: string;
  status: string;
  submittedAt: string;
  paidAt: string | null;
  lineDate: string | null;
  driverId: string | null;
  driverName: string | null;
  vehicleId: string | null;
  vehicleNumber: string | null;
  vehicleTypeName: string | null;
  costCenterId: string | null;
  costCenterCode: string | null;
  categoryId: string;
  categoryCode: string;
  expenseTypeAr: string;
  expenseTypeEn: string;
  glAccountId: string | null;
  glNumber: string | null;
  glName: string | null;
  originalAmount: string;
  finalAmount: string;
  liters: string | null;
  pricePerLiter: string | null;
  odometer: number | null;
  approvers: ReportApprover[];
  sapDocNumber: string | null;
  imageCount: number;
  /** Web route of the request, e.g. `/requests/<id>`. */
  link: string;
}

export interface ReportGroupDto {
  key: string;
  label: string;
  count: number;
  originalTotal: string;
  finalTotal: string;
}

export interface ReportTotalsDto {
  count: number;
  originalTotal: string;
  finalTotal: string;
}

/** `rows` is the requested page; `groups` is present only with `groupBy` and covers the WHOLE filtered set; `totals` always covers the whole filtered set. */
export interface ReportResultDto {
  rows: ReportRowDto[];
  groups?: ReportGroupDto[];
  totals: ReportTotalsDto;
  page: number;
  pageSize: number;
}

// ---------- exports ----------
export const createExportSchema = z.object({
  kind: z.enum(EXPORT_KINDS),
  filters: reportFiltersSchema,
  groupBy: z.enum(REPORT_GROUP_BY).optional(),
  options: z
    .object({
      /** ZIP folder pattern; tokens {expenseType} {requestNumber} {driver} {vehicle} {month}. Default from setting reports.zipFolderPattern. */
      folderPattern: z.string().max(120).optional(),
    })
    .optional(),
});
export type CreateExportDto = z.infer<typeof createExportSchema>;

export type ExportStatusDto = 'QUEUED' | 'RUNNING' | 'DONE' | 'FAILED' | 'EXPIRED';

export interface ExportInfoDto {
  id: string;
  kind: (typeof EXPORT_KINDS)[number];
  status: ExportStatusDto;
  fileName: string | null;
  sizeBytes: number | null;
  rowCount: number | null;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
  expiresAt: string | null;
  /** Fresh signed URL (5 min) while status is DONE and not expired; otherwise null. */
  downloadUrl: string | null;
}

// ---------- dashboard ----------
export const dashboardQuerySchema = z.object({ from: isoDate.optional(), to: isoDate.optional() });
export type DashboardQueryDto = z.infer<typeof dashboardQuerySchema>;

export interface DashboardSummaryDto {
  range: { from: string | null; to: string | null };
  totals: ReportTotalsDto;
  /** Month buckets (`2026-03`) of submittedAt. */
  byPeriod: { period: string; count: number; total: string }[];
  byVehicle: { vehicleId: string; vehicleNumber: string; count: number; total: string }[];
  byExpenseType: { categoryId: string; code: string; nameAr: string; nameEn: string; count: number; total: string }[];
  /** Top 10 vehicles by final total, descending. */
  topVehicles: { vehicleId: string; vehicleNumber: string; count: number; total: string }[];
  avgApprovalHoursByStep: { stepKey: string; nameAr: string; nameEn: string; count: number; avgHours: number }[];
  /** Active step instances past `dueAt`, per role. */
  delayedByRole: { roleId: string; nameAr: string; nameEn: string; count: number }[];
}

export interface DelayedItemDto {
  requestId: string;
  requestNumber: string;
  submitterName: string | null;
  stepInstanceId: string;
  stepNameAr: string;
  stepNameEn: string;
  roleId: string;
  roleNameAr: string;
  roleNameEn: string;
  activatedAt: string | null;
  dueAt: string;
  overdueHours: number;
}
