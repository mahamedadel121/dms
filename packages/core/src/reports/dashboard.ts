import { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import type { Db } from '../common';
import { FROM_SQL, buildWhere } from './query';

export interface DashboardSummary {
  range: { from: string | null; to: string | null };
  totals: { count: number; originalTotal: string; finalTotal: string };
  byPeriod: { period: string; count: number; total: string }[];
  byVehicle: { vehicleId: string; vehicleNumber: string; count: number; total: string }[];
  byExpenseType: { categoryId: string; code: string; nameAr: string; nameEn: string; count: number; total: string }[];
  topVehicles: { vehicleId: string; vehicleNumber: string; count: number; total: string }[];
  avgApprovalHoursByStep: { stepKey: string; nameAr: string; nameEn: string; count: number; avgHours: number }[];
  delayedByRole: { roleId: string; nameAr: string; nameEn: string; count: number }[];
}

export interface DelayedItem {
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

const m = (v: string | null | undefined): string => new Decimal(v ?? 0).toFixed(2);

/** Spending views exclude REJECTED and CANCELLED requests; counts are distinct requests. */
export async function dashboardSummary(db: Db, f: { from?: string; to?: string }): Promise<DashboardSummary> {
  const filters = {
    dateField: 'submittedAt' as const,
    from: f.from,
    to: f.to,
    statuses: ['IN_REVIEW', 'CORRECTION_REQUESTED', 'APPROVED', 'PAID'],
  };
  const where = buildWhere(filters);

  const [tot] = await db.$queryRaw<{ n: bigint; o: string; f: string }[]>`
    SELECT count(DISTINCT r.id) AS n, COALESCE(sum(l."originalAmount"),0)::text AS o, COALESCE(sum(l.amount),0)::text AS f
    ${FROM_SQL} ${where}`;
  const period = await db.$queryRaw<{ p: string; n: bigint; t: string }[]>`
    SELECT to_char(r."submittedAt" AT TIME ZONE 'Africa/Cairo', 'YYYY-MM') AS p, count(DISTINCT r.id) AS n, sum(l.amount)::text AS t
    ${FROM_SQL} ${where} GROUP BY 1 ORDER BY 1`;
  const vehicles = await db.$queryRaw<{ id: string; num: string; n: bigint; t: string }[]>`
    SELECT v.id, v.number AS num, count(DISTINCT r.id) AS n, sum(l.amount)::text AS t
    ${FROM_SQL} ${where} AND v.id IS NOT NULL
    GROUP BY v.id, v.number ORDER BY sum(l.amount) DESC, v.number`;
  const types = await db.$queryRaw<{ id: string; code: string | null; ar: string; en: string; n: bigint; t: string }[]>`
    SELECT l."categoryId" AS id, max(c.code) AS code, max(l."categoryNameAr") AS ar, max(l."categoryNameEn") AS en,
      count(DISTINCT r.id) AS n, sum(l.amount)::text AS t
    ${FROM_SQL} ${where} GROUP BY l."categoryId" ORDER BY sum(l.amount) DESC`;

  const steps = await db.$queryRaw<{ k: string; ar: string; en: string; n: bigint; h: number }[]>`
    SELECT si."stepKey" AS k, max(si."nameAr") AS ar, max(si."nameEn") AS en, count(*) AS n,
      avg(extract(epoch FROM (si."actedAt" - si."activatedAt")) / 3600.0)::float AS h
    FROM request_step_instances si JOIN requests r ON r.id = si."requestId"
    WHERE si.status = 'APPROVED' AND si."activatedAt" IS NOT NULL AND si."actedAt" IS NOT NULL
      ${rangeOnRequests(f)}
    GROUP BY si."stepKey" ORDER BY min(si."sortOrder")`;

  const delayed = await db.$queryRaw<{ id: string; ar: string; en: string; n: bigint }[]>`
    SELECT si."roleId" AS id, max(si."roleNameAr") AS ar, max(si."roleNameEn") AS en, count(*) AS n
    FROM request_step_instances si JOIN requests r ON r.id = si."requestId"
    WHERE si.status = 'ACTIVE' AND si."dueAt" IS NOT NULL AND si."dueAt" < now() AND r.status = 'IN_REVIEW'
    GROUP BY si."roleId" ORDER BY count(*) DESC`;

  const byVehicle = vehicles.map((v) => ({ vehicleId: v.id, vehicleNumber: v.num, count: Number(v.n), total: m(v.t) }));
  return {
    range: { from: f.from ?? null, to: f.to ?? null },
    totals: { count: Number(tot!.n), originalTotal: m(tot!.o), finalTotal: m(tot!.f) },
    byPeriod: period.map((p) => ({ period: p.p, count: Number(p.n), total: m(p.t) })),
    byVehicle,
    byExpenseType: types.map((t) => ({
      categoryId: t.id,
      code: t.code ?? '',
      nameAr: t.ar,
      nameEn: t.en,
      count: Number(t.n),
      total: m(t.t),
    })),
    topVehicles: byVehicle.slice(0, 10),
    avgApprovalHoursByStep: steps.map((s) => ({
      stepKey: s.k,
      nameAr: s.ar,
      nameEn: s.en,
      count: Number(s.n),
      avgHours: Math.round((s.h ?? 0) * 100) / 100,
    })),
    delayedByRole: delayed.map((d) => ({ roleId: d.id, nameAr: d.ar, nameEn: d.en, count: Number(d.n) })),
  };
}

function rangeOnRequests(f: { from?: string; to?: string }): Prisma.Sql {
  const parts: Prisma.Sql[] = [];
  if (f.from) parts.push(Prisma.sql`AND r."submittedAt" >= (${f.from.slice(0, 10)}::date)::timestamp AT TIME ZONE 'Africa/Cairo'`);
  if (f.to) parts.push(Prisma.sql`AND r."submittedAt" < ((${f.to.slice(0, 10)}::date + 1))::timestamp AT TIME ZONE 'Africa/Cairo'`);
  return parts.length ? Prisma.join(parts, ' ') : Prisma.empty;
}

export async function listDelayed(db: Db): Promise<DelayedItem[]> {
  const rows = await db.$queryRaw<
    {
      rid: string; num: string; sub: string | null; sid: string; sar: string; sen: string; role: string; rar: string; ren: string;
      act: Date | null; due: Date; od: number;
    }[]
  >`
    SELECT r.id AS rid, r.number AS num, s."fullName" AS sub, si.id AS sid, si."nameAr" AS sar, si."nameEn" AS sen,
      si."roleId" AS role, si."roleNameAr" AS rar, si."roleNameEn" AS ren, si."activatedAt" AS act, si."dueAt" AS due,
      (extract(epoch FROM (now() - si."dueAt")) / 3600.0)::float AS od
    FROM request_step_instances si JOIN requests r ON r.id = si."requestId" LEFT JOIN submitters s ON s.id = r."submitterId"
    WHERE si.status = 'ACTIVE' AND si."dueAt" IS NOT NULL AND si."dueAt" < now() AND r.status = 'IN_REVIEW'
    ORDER BY si."dueAt" LIMIT 500`;
  return rows.map((x) => ({
    requestId: x.rid,
    requestNumber: x.num,
    submitterName: x.sub,
    stepInstanceId: x.sid,
    stepNameAr: x.sar,
    stepNameEn: x.sen,
    roleId: x.role,
    roleNameAr: x.rar,
    roleNameEn: x.ren,
    activatedAt: x.act ? x.act.toISOString() : null,
    dueAt: x.due.toISOString(),
    overdueHours: Math.round(x.od * 10) / 10,
  }));
}
