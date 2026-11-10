import type { PrismaClient } from '@prisma/client';
import type { Db } from '../common';
import type { StorageAdapter } from '../storage';
import { DomainError } from '../errors';

// TODO(WP5): implement; ReportFilters per PLAN section 11.
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
export type ReportRow = Record<string, unknown>;
export interface ReportResult {
  rows: ReportRow[];
  groups?: { key: string; label: string; count: number; originalTotal: string; finalTotal: string }[];
  totals: { count: number; originalTotal: string; finalTotal: string };
}
export type DashboardSummary = Record<string, unknown>;

const ni = (n: string): never => {
  throw new DomainError('NOT_IMPLEMENTED', `${n} is not implemented yet (WP5)`);
};

export async function queryReport(
  _db: Db,
  _f: ReportFilters,
  _o: { groupBy?: GroupBy; page: number; pageSize: number },
): Promise<ReportResult> {
  return ni('queryReport');
}
export async function runExport(_prisma: PrismaClient, _storage: StorageAdapter, _exportId: string): Promise<void> {
  return ni('runExport');
}
export async function dashboardSummary(_db: Db, _f: { from?: string; to?: string }): Promise<DashboardSummary> {
  return ni('dashboardSummary');
}
