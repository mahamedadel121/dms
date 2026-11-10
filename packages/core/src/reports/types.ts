export interface ReportFilters {
  dateField: 'submittedAt' | 'paidAt' | 'lineDate';
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
export type GroupBy = 'driver' | 'vehicle' | 'expenseType' | 'gl' | 'costCenter' | 'month';

export interface ReportApprover {
  roleNameAr: string;
  roleNameEn: string;
  userName: string | null;
  actedAt: string | null;
}

export interface ReportRow {
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
  link: string;
}

export interface ReportGroup {
  key: string;
  label: string;
  count: number;
  originalTotal: string;
  finalTotal: string;
}
export interface ReportTotals {
  count: number;
  originalTotal: string;
  finalTotal: string;
}
export interface ReportResult {
  rows: ReportRow[];
  groups?: ReportGroup[];
  totals: ReportTotals;
  page: number;
  pageSize: number;
}
