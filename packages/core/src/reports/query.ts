import { Prisma } from '@prisma/client';
import type { Db } from '../common';
import { DomainError } from '../errors';
import type { GroupBy, ReportApprover, ReportFilters, ReportGroup, ReportResult, ReportRow, ReportTotals } from './types';

const TZ = 'Africa/Cairo';
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export const FROM_SQL = Prisma.sql`
  FROM request_lines l
  JOIN requests r ON r.id = l."requestId"
  LEFT JOIN expense_requests er ON er."requestId" = r.id
  LEFT JOIN expense_lines el ON el."lineId" = l.id
  LEFT JOIN line_categories c ON c.id = l."categoryId"
  LEFT JOIN submitters s ON s.id = r."submitterId"
  LEFT JOIN vehicles v ON v.id = COALESCE(el."vehicleId", er."vehicleId")
  LEFT JOIN cost_centers cc ON cc.id = COALESCE(el."costCenterId", er."costCenterId")
  LEFT JOIN vehicle_types vt ON vt.id = er."vehicleTypeId"
  LEFT JOIN gl_accounts g ON g.id = el."glAccountId"`;

const lineDateExpr = Prisma.sql`COALESCE(l."lineDate", (r."submittedAt" AT TIME ZONE 'Africa/Cairo')::date)`;

function dateBounds(f: ReportFilters): Prisma.Sql[] {
  const out: Prisma.Sql[] = [];
  const check = (v: string) => {
    if (Number.isNaN(Date.parse(v))) throw new DomainError('VALIDATION', `Invalid date: ${v}`);
  };
  if (f.from) check(f.from);
  if (f.to) check(f.to);
  if (f.dateField === 'lineDate') {
    if (f.from) out.push(Prisma.sql`${lineDateExpr} >= ${f.from.slice(0, 10)}::date`);
    if (f.to) out.push(Prisma.sql`${lineDateExpr} <= ${f.to.slice(0, 10)}::date`);
    return out;
  }
  const col = f.dateField === 'paidAt' ? Prisma.sql`r."paidAt"` : Prisma.sql`r."submittedAt"`;
  if (f.from) {
    out.push(
      DAY_RE.test(f.from)
        ? Prisma.sql`${col} >= (${f.from}::date)::timestamp AT TIME ZONE ${TZ}`
        : Prisma.sql`${col} >= ${f.from}::timestamptz`,
    );
  }
  if (f.to) {
    out.push(
      DAY_RE.test(f.to)
        ? Prisma.sql`${col} < ((${f.to}::date + 1))::timestamp AT TIME ZONE ${TZ}`
        : Prisma.sql`${col} <= ${f.to}::timestamptz`,
    );
  }
  return out;
}

export function buildWhere(f: ReportFilters): Prisma.Sql {
  const w: Prisma.Sql[] = [...dateBounds(f)];
  const arr = (a: string[] | undefined) => (a && a.length ? a : null);
  const submitters = arr(f.submitterIds);
  if (submitters) w.push(Prisma.sql`r."submitterId" = ANY(${submitters}::text[])`);
  const vehicles = arr(f.vehicleIds);
  if (vehicles) w.push(Prisma.sql`COALESCE(el."vehicleId", er."vehicleId") = ANY(${vehicles}::text[])`);
  const vtypes = arr(f.vehicleTypeIds);
  if (vtypes) w.push(Prisma.sql`er."vehicleTypeId" = ANY(${vtypes}::text[])`);
  const ccs = arr(f.costCenterIds);
  if (ccs) w.push(Prisma.sql`COALESCE(el."costCenterId", er."costCenterId") = ANY(${ccs}::text[])`);
  const cats = arr(f.categoryIds);
  if (cats) w.push(Prisma.sql`l."categoryId" = ANY(${cats}::text[])`);
  const gls = arr(f.glAccountIds);
  if (gls) w.push(Prisma.sql`el."glAccountId" = ANY(${gls}::text[])`);
  const statuses = arr(f.statuses);
  if (statuses) w.push(Prisma.sql`r.status::text = ANY(${statuses}::text[])`);
  const roles = arr(f.stepRoleIds);
  if (roles) {
    w.push(Prisma.sql`EXISTS (SELECT 1 FROM request_step_instances si WHERE si."requestId" = r.id
      AND si."roleId" = ANY(${roles}::text[]) AND si.status IN ('ACTIVE','AWAITING_CORRECTION'))`);
  }
  if (f.number?.trim()) {
    const esc = f.number.trim().replace(/[\\%_]/g, (m) => `\\${m}`);
    w.push(Prisma.sql`r.number ILIKE ${'%' + esc + '%'}`);
  }
  for (const [v, op] of [[f.minAmount, '>='], [f.maxAmount, '<=']] as const) {
    if (v === undefined || v === '') continue;
    if (!/^\d+(\.\d+)?$/.test(v)) throw new DomainError('VALIDATION', `Invalid amount: ${v}`);
    w.push(op === '>=' ? Prisma.sql`l.amount >= ${v}::numeric` : Prisma.sql`l.amount <= ${v}::numeric`);
  }
  return w.length ? Prisma.sql`WHERE ${Prisma.join(w, ' AND ')}` : Prisma.empty;
}

function groupExprs(g: GroupBy, f: ReportFilters): { key: Prisma.Sql; label: Prisma.Sql } {
  switch (g) {
    case 'driver':
      return { key: Prisma.sql`COALESCE(r."submitterId", '')`, label: Prisma.sql`COALESCE(s."fullName", '-')` };
    case 'vehicle':
      return { key: Prisma.sql`COALESCE(v.id, '')`, label: Prisma.sql`COALESCE(v.number, '-')` };
    case 'expenseType':
      return { key: Prisma.sql`l."categoryId"`, label: Prisma.sql`COALESCE(c."nameEn", l."categoryNameEn")` };
    case 'gl':
      return {
        key: Prisma.sql`COALESCE(g.id, '')`,
        label: Prisma.sql`COALESCE(g.number || ' ' || g."nameEn", '-')`,
      };
    case 'costCenter':
      return { key: Prisma.sql`COALESCE(cc.id, '')`, label: Prisma.sql`COALESCE(cc.code, '-')` };
    case 'month': {
      const d =
        f.dateField === 'lineDate'
          ? lineDateExpr
          : f.dateField === 'paidAt'
            ? Prisma.sql`(r."paidAt" AT TIME ZONE 'Africa/Cairo')`
            : Prisma.sql`(r."submittedAt" AT TIME ZONE 'Africa/Cairo')`;
      return { key: Prisma.sql`COALESCE(to_char(${d}, 'YYYY-MM'), '')`, label: Prisma.sql`COALESCE(to_char(${d}, 'YYYY-MM'), '-')` };
    }
    default:
      throw new DomainError('VALIDATION', `Unknown groupBy: ${String(g)}`);
  }
}

interface RawRow {
  lineId: string;
  lineNo: number;
  requestId: string;
  number: string;
  status: string;
  submittedAt: Date;
  paidAt: Date | null;
  lineDate: Date | string | null;
  driverId: string | null;
  driverName: string | null;
  vehicleId: string | null;
  vehicleNumber: string | null;
  vehicleTypeName: string | null;
  costCenterId: string | null;
  costCenterCode: string | null;
  categoryId: string;
  categoryCode: string | null;
  nameAr: string;
  nameEn: string;
  glId: string | null;
  glNumber: string | null;
  glName: string | null;
  originalAmount: string;
  amount: string;
  quantity: string | null;
  unitPrice: string | null;
  odometer: number | null;
  sapDocNumber: string | null;
  imageCount: number;
  groupLabel?: string;
}

const selectRows = (extra: Prisma.Sql) => Prisma.sql`
  SELECT l.id AS "lineId", l."lineNo", r.id AS "requestId", r.number, r.status::text AS status,
    r."submittedAt", r."paidAt",
    to_char(${lineDateExpr}, 'YYYY-MM-DD') AS "lineDate",
    r."submitterId" AS "driverId", s."fullName" AS "driverName",
    v.id AS "vehicleId", COALESCE(el."vehicleNumber", er."vehicleNumber", v.number) AS "vehicleNumber",
    COALESCE(vt."nameEn", er."vehicleTypeName") AS "vehicleTypeName",
    cc.id AS "costCenterId", COALESCE(el."costCenterCode", er."costCenterCode", cc.code) AS "costCenterCode",
    l."categoryId", c.code AS "categoryCode", l."categoryNameAr" AS "nameAr", l."categoryNameEn" AS "nameEn",
    g.id AS "glId", COALESCE(el."glNumber", g.number) AS "glNumber", COALESCE(el."glName", g."nameEn") AS "glName",
    l."originalAmount"::text AS "originalAmount", l.amount::text AS amount,
    l.quantity::text AS quantity, l."unitPrice"::text AS "unitPrice",
    er.odometer, er."sapDocNumber",
    (SELECT count(*)::int FROM attachments a WHERE a."lineId" = l.id AND a."isCurrent") AS "imageCount"${extra}`;

async function attachApprovers(db: Db, requestIds: string[]): Promise<Map<string, ReportApprover[]>> {
  const out = new Map<string, ReportApprover[]>();
  if (!requestIds.length) return out;
  const steps = await db.requestStepInstance.findMany({
    where: { requestId: { in: requestIds }, status: 'APPROVED' },
    orderBy: [{ sortOrder: 'asc' }],
    select: { requestId: true, roleNameAr: true, roleNameEn: true, actedAt: true, actedBy: { select: { fullName: true } } },
  });
  for (const s of steps) {
    const list = out.get(s.requestId) ?? [];
    list.push({
      roleNameAr: s.roleNameAr,
      roleNameEn: s.roleNameEn,
      userName: s.actedBy?.fullName ?? null,
      actedAt: s.actedAt ? s.actedAt.toISOString() : null,
    });
    out.set(s.requestId, list);
  }
  return out;
}

export type ReportRowG = ReportRow & { groupLabel?: string };

function toRow(r: RawRow, approvers: Map<string, ReportApprover[]>): ReportRowG {
  return {
    groupLabel: r.groupLabel,
    lineId: r.lineId,
    lineNo: r.lineNo,
    requestId: r.requestId,
    requestNumber: r.number,
    status: r.status,
    submittedAt: new Date(r.submittedAt).toISOString(),
    paidAt: r.paidAt ? new Date(r.paidAt).toISOString() : null,
    lineDate: r.lineDate ? String(r.lineDate).slice(0, 10) : null,
    driverId: r.driverId,
    driverName: r.driverName,
    vehicleId: r.vehicleId,
    vehicleNumber: r.vehicleNumber,
    vehicleTypeName: r.vehicleTypeName,
    costCenterId: r.costCenterId,
    costCenterCode: r.costCenterCode,
    categoryId: r.categoryId,
    categoryCode: r.categoryCode ?? '',
    expenseTypeAr: r.nameAr,
    expenseTypeEn: r.nameEn,
    glAccountId: r.glId,
    glNumber: r.glNumber,
    glName: r.glName,
    originalAmount: r.originalAmount,
    finalAmount: r.amount,
    liters: r.quantity,
    pricePerLiter: r.unitPrice,
    odometer: r.odometer,
    approvers: approvers.get(r.requestId) ?? [],
    sapDocNumber: r.sapDocNumber,
    imageCount: Number(r.imageCount),
    link: `/requests/${r.requestId}`,
  };
}

export async function reportTotals(db: Db, f: ReportFilters): Promise<ReportTotals> {
  const where = buildWhere(f);
  const [t] = await db.$queryRaw<{ n: bigint; o: string | null; f: string | null }[]>`
    SELECT count(*) AS n, COALESCE(sum(l."originalAmount"), 0)::text AS o, COALESCE(sum(l.amount), 0)::text AS f
    ${FROM_SQL} ${where}`;
  return { count: Number(t!.n), originalTotal: money(t!.o), finalTotal: money(t!.f) };
}

const money = (v: string | null | undefined): string => {
  const n = v ?? '0';
  return n.includes('.') ? n : `${n}.00`;
};

export async function reportGroups(db: Db, f: ReportFilters, g: GroupBy): Promise<ReportGroup[]> {
  const where = buildWhere(f);
  const { key, label } = groupExprs(g, f);
  const rows = await db.$queryRaw<{ key: string; label: string; n: bigint; o: string; f: string }[]>`
    SELECT ${key} AS key, ${label} AS label, count(*) AS n,
      sum(l."originalAmount")::text AS o, sum(l.amount)::text AS f
    ${FROM_SQL} ${where} GROUP BY 1, 2 ORDER BY 2, 1`;
  return rows.map((r) => ({
    key: r.key,
    label: r.label,
    count: Number(r.n),
    originalTotal: money(r.o),
    finalTotal: money(r.f),
  }));
}

export async function fetchRows(
  db: Db,
  f: ReportFilters,
  o: { groupBy?: GroupBy; offset: number; limit: number },
): Promise<ReportRowG[]> {
  const where = buildWhere(f);
  const gl = o.groupBy ? groupExprs(o.groupBy, f).label : null;
  const order = gl
    ? Prisma.sql`ORDER BY ${gl}, r."submittedAt" DESC, r.number, l."lineNo"`
    : Prisma.sql`ORDER BY r."submittedAt" DESC, r.number, l."lineNo"`;
  const extra = gl ? Prisma.sql`, ${gl} AS "groupLabel"` : Prisma.empty;
  const raw = await db.$queryRaw<RawRow[]>`
    ${selectRows(extra)} ${FROM_SQL} ${where} ${order} LIMIT ${o.limit} OFFSET ${o.offset}`;
  const approvers = await attachApprovers(db, [...new Set(raw.map((r) => r.requestId))]);
  return raw.map((r) => toRow(r, approvers));
}

/** Iterates every filtered row in batches (for exports). */
export async function* iterateRows(
  db: Db,
  f: ReportFilters,
  groupBy?: GroupBy,
  batch = 1000,
): AsyncGenerator<ReportRowG> {
  for (let offset = 0; ; offset += batch) {
    const rows = await fetchRows(db, f, { groupBy, offset, limit: batch });
    for (const r of rows) yield r;
    if (rows.length < batch) return;
  }
}

export async function queryReport(
  db: Db,
  f: ReportFilters,
  o: { groupBy?: GroupBy; page: number; pageSize: number },
): Promise<ReportResult> {
  const pageSize = Math.min(Math.max(1, Math.floor(o.pageSize)), 500);
  const page = Math.max(1, Math.floor(o.page));
  const [rows, totals, groups] = await Promise.all([
    fetchRows(db, f, { groupBy: o.groupBy, offset: (page - 1) * pageSize, limit: pageSize }),
    reportTotals(db, f),
    o.groupBy ? reportGroups(db, f, o.groupBy) : Promise.resolve(undefined),
  ]);
  return { rows: rows.map(({ groupLabel: _g, ...r }) => r), ...(groups ? { groups } : {}), totals, page, pageSize };
}
