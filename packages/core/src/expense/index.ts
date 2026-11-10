import type { Prisma, Request, RequestLine } from '@prisma/client';
import type { Db } from '../common';
import { getSetting, getConfig } from '../config';
import { DomainError } from '../errors';
import { enqueueJob } from '../jobs/enqueue';
import { registerModule, type RequestModule, type SubmitRequestInput } from '../engine';
import { buildJournalEntry } from '../sap';
import { toJsonValue } from '../audit';

/**
 * Expense module hooks (PLAN 1.1, D15-D17). `input.headerValues` carries `odometer` (required header field)
 * and optionally `vehicleId`; without it the submitter's current assignment decides the vehicle.
 */
export const EXPENSE_MODULE_KEY = 'expense';

async function resolveVehicle(db: Db, input: Pick<SubmitRequestInput, 'submitterId' | 'headerValues'>) {
  const explicit = input.headerValues?.vehicleId;
  let vehicleId = typeof explicit === 'string' && explicit ? explicit : null;
  if (!vehicleId) {
    if (!input.submitterId) throw new DomainError('VALIDATION', 'A vehicle is required (vehicleId or a current assignment)');
    const a = await db.driverVehicleAssignment.findFirst({
      where: { submitterId: input.submitterId, validTo: null },
      orderBy: { validFrom: 'desc' },
    });
    if (!a) throw new DomainError('VALIDATION', 'The driver has no current vehicle assignment');
    vehicleId = a.vehicleId;
  }
  const v = await db.vehicle.findUnique({ where: { id: vehicleId }, include: { vehicleType: true, costCenter: true } });
  if (!v || !v.isActive) throw new DomainError('VALIDATION', 'Vehicle not found or inactive');
  return v;
}

function odometerOf(input: Pick<SubmitRequestInput, 'headerValues'>): number {
  const n = Number(input.headerValues?.odometer);
  if (!Number.isInteger(n) || n < 0) throw new DomainError('VALIDATION', 'odometer must be a non-negative integer');
  return n;
}

async function glFor(db: Db, categoryId: string) {
  const cfg = await db.expenseTypeConfig.findUnique({ where: { lineCategoryId: categoryId }, include: { glAccount: true } });
  if (!cfg) throw new DomainError('VALIDATION', 'The expense type has no GL account configured');
  return cfg.glAccount;
}

const expenseModule: RequestModule = {
  key: EXPENSE_MODULE_KEY,

  async validateSubmission(db, input) {
    const v = await resolveVehicle(db, input);
    odometerOf(input);
    if (v.status === 'STOPPED' && (await getSetting(db, 'expense.blockStoppedVehicle'))) {
      throw new DomainError('VALIDATION', `Vehicle ${v.number} is stopped; requests are blocked`);
    }
  },

  async afterCreate(tx, req, lines, input) {
    const v = await resolveVehicle(tx, input);
    const odometer = odometerOf(input);
    const last = v.lastOdometer;
    const maxJump = await getSetting(tx, 'expense.odometerMaxJumpKm');
    const warning =
      last !== null && odometer < last ? 'LOWER_THAN_LAST' : last !== null && odometer - last > maxJump ? 'UNREALISTIC_JUMP' : null;
    await tx.expenseRequest.create({
      data: {
        requestId: req.id,
        vehicleId: v.id,
        vehicleNumber: v.number,
        plateNumber: v.plateNumber,
        vehicleTypeId: v.vehicleTypeId,
        vehicleTypeName: v.vehicleType.nameAr,
        costCenterId: v.costCenterId,
        costCenterCode: v.costCenter.code,
        odometer,
        previousOdometer: last,
        odometerWarning: warning,
      },
    });
    if (last === null || odometer >= last) {
      await tx.vehicle.update({ where: { id: v.id }, data: { lastOdometer: odometer, lastOdometerAt: new Date() } });
    }
    for (const l of lines) {
      const gl = await glFor(tx, l.categoryId);
      await tx.expenseLine.create({
        data: {
          lineId: l.id,
          requestId: req.id,
          glAccountId: gl.id,
          glNumber: gl.number,
          glName: gl.nameAr,
          costCenterId: v.costCenterId,
          costCenterCode: v.costCenter.code,
          vehicleId: v.id,
          vehicleNumber: v.number,
        },
      });
    }
  },

  async conditionFacts(db, requestId) {
    const e = await db.expenseRequest.findUnique({
      where: { requestId },
      include: { vehicle: true, vehicleType: true },
    });
    if (!e) return {};
    return {
      vehicleNumber: e.vehicleNumber,
      vehicleTypeCode: e.vehicleType?.code ?? null,
      costCenterCode: e.costCenterCode,
      vehicleStatus: e.vehicle.status,
    };
  },

  /** GL snapshot follows the new category after reclassification. */
  async onLineChanged(tx, _req, line: RequestLine, changed) {
    if (!changed.includes('categoryId')) return;
    const gl = await glFor(tx, line.categoryId);
    await tx.expenseLine.update({
      where: { lineId: line.id },
      data: { glAccountId: gl.id, glNumber: gl.number, glName: gl.nameAr },
    });
  },

  async beforeApprove(tx, ctx) {
    const id = ctx.actionData?.treasuryId;
    if (id !== undefined && id !== null && id !== '') {
      const t = await tx.treasury.findUnique({ where: { id: String(id) } });
      if (!t || !t.isActive) throw new DomainError('VALIDATION', 'Treasury not found or inactive');
    }
  },

  async onPaid(tx, req: Request, ctx) {
    const wanted = ctx.actionData?.treasuryId ? String(ctx.actionData.treasuryId) : null;
    const treasury = wanted
      ? await tx.treasury.findUnique({ where: { id: wanted } })
      : ((await tx.treasury.findFirst({ where: { isDefault: true, isActive: true } })) ??
        (await tx.treasury.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'asc' } })));
    if (!treasury) throw new DomainError('VALIDATION', 'No treasury available for payment');
    await tx.expenseRequest.update({ where: { requestId: req.id }, data: { treasuryId: treasury.id } });
    let posting = await tx.sapPosting.findUnique({ where: { requestId: req.id } });
    if (!posting) {
      let payload: unknown;
      try {
        payload = await buildJournalEntry(tx, req.id);
      } catch (e) {
        // TODO(WP2): drop this fallback once WP4's buildJournalEntry is stable in every environment.
        if (e instanceof DomainError && e.code === 'NOT_IMPLEMENTED') {
          payload = { idempotencyKey: req.id, reference: req.number, pending: 'buildJournalEntry not implemented' };
        } else throw e;
      }
      posting = await tx.sapPosting.create({
        data: {
          requestId: req.id,
          idempotencyKey: req.id,
          status: 'PENDING',
          adapter: getConfig().SAP_ADAPTER,
          payload: toJsonValue(payload) as Prisma.InputJsonValue,
        },
      });
    }
    await enqueueJob(tx, { type: 'sap.post', payload: { postingId: posting.id, trigger: 'AUTO' }, dedupeKey: `sap.post:${req.id}` });
    await enqueueJob(tx, { type: 'pdf.finalize', payload: { requestId: req.id }, dedupeKey: `pdf.finalize:${req.id}` });
  },

  async detailExtras(db, requestId) {
    const e = await db.expenseRequest.findUnique({
      where: { requestId },
      include: { treasury: true, vehicle: { select: { status: true } } },
    });
    if (!e) return {};
    const sap = await db.sapPosting.findUnique({ where: { requestId } });
    return {
      vehicleId: e.vehicleId,
      vehicleNumber: e.vehicleNumber,
      plateNumber: e.plateNumber,
      vehicleTypeName: e.vehicleTypeName,
      vehicleStatus: e.vehicle.status,
      costCenterCode: e.costCenterCode,
      odometer: e.odometer,
      previousOdometer: e.previousOdometer,
      odometerWarning: e.odometerWarning,
      treasury: e.treasury ? { id: e.treasury.id, code: e.treasury.code, name: e.treasury.name } : null,
      sap: sap
        ? { postingId: sap.id, status: sap.status, docNumber: sap.sapDocNumber ?? e.sapDocNumber, lastError: sap.lastError }
        : null,
    };
  },

  async templateData(db, requestId) {
    const e = await db.expenseRequest.findUnique({ where: { requestId } });
    if (!e) return { headerValues: [] };
    return {
      headerValues: [
        { key: 'vehicleNumber', value: e.vehicleNumber },
        { key: 'vehicleType', value: e.vehicleTypeName ?? '' },
        { key: 'costCenter', value: e.costCenterCode },
        { key: 'odometer', value: String(e.odometer) },
      ],
    };
  },

  async listSummary(db, requestIds) {
    const rows = await db.expenseRequest.findMany({
      where: { requestId: { in: requestIds } },
      include: { vehicleType: { select: { code: true } } },
    });
    const out: Record<string, Record<string, unknown>> = {};
    for (const r of rows) {
      out[r.requestId] = {
        vehicleNumber: r.vehicleNumber,
        vehicleTypeCode: r.vehicleType?.code ?? null,
        costCenterCode: r.costCenterCode,
        odometerWarning: r.odometerWarning,
      };
    }
    return out;
  },
};

/** Registers the expense module (call once at startup in api, bot, worker and tests). Idempotent. */
export function registerExpenseModule(): void {
  registerModule(expenseModule);
}
