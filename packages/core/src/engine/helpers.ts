import type { Prisma, PrismaClient, Request, RequestLine, LineCategory } from '@prisma/client';
import {
  dec,
  divDecimal,
  hasMaxDecimals,
  normalizeDigits,
  sumDecimals,
  type ConditionFacts,
  type FieldDefinition,
} from '@dms/shared';
import type { Actor, Db } from '../common';
import { DomainError } from '../errors';
import { toJsonValue } from '../audit';
import { getModule } from './registry';
import type { LineWarning } from './types';

export const OPEN_STATUSES = ['IN_REVIEW', 'CORRECTION_REQUESTED'] as const;

/** Runs `fn` in an interactive transaction with generous limits (PLAN 5.3: 15 s budget, we allow 30 s under load). */
export function runTx<T>(prisma: PrismaClient, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(fn, { maxWait: 30000, timeout: 30000 });
}

/** `SELECT ... FOR UPDATE` on the request row, returns the fresh row. */
export async function lockRequestRow(tx: Db, requestId: string): Promise<Request> {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM requests WHERE id = ${requestId} FOR UPDATE`;
  if (rows.length === 0) throw new DomainError('NOT_FOUND', 'Request not found');
  return tx.request.findUniqueOrThrow({ where: { id: requestId } });
}

export async function touchRequest(tx: Db, requestId: string, data: Prisma.RequestUncheckedUpdateInput = {}): Promise<Request> {
  return tx.request.update({ where: { id: requestId }, data: { ...data, rowVersion: { increment: 1 } } });
}

export async function addEvent(
  tx: Db,
  e: {
    requestId: string;
    type: string;
    actor: Actor;
    stepInstanceId?: string | null;
    lineId?: string | null;
    attachmentId?: string | null;
    comment?: string | null;
    data?: unknown;
  },
): Promise<void> {
  await tx.requestEvent.create({
    data: {
      requestId: e.requestId,
      type: e.type,
      actorType: e.actor.type,
      actorUserId: e.actor.type === 'USER' ? (e.actor.userId ?? null) : null,
      actorSubmitterId: e.actor.type === 'SUBMITTER' ? (e.actor.submitterId ?? null) : null,
      stepInstanceId: e.stepInstanceId ?? null,
      lineId: e.lineId ?? null,
      attachmentId: e.attachmentId ?? null,
      comment: e.comment ?? null,
      data: toJsonValue(e.data),
    },
  });
}

export type FactsBase = Omit<ConditionFacts, 'stepRoleId'>;

export async function loadFactsBase(db: Db, requestId: string): Promise<FactsBase> {
  const req = await db.request.findUniqueOrThrow({
    where: { id: requestId },
    include: { requestType: true, department: true },
  });
  const lines = await db.requestLine.findMany({
    where: { requestId },
    include: { category: { include: { approvalRoles: true } } },
  });
  const mod = getModule(req.requestType.moduleKey);
  const moduleFacts = mod?.conditionFacts ? await mod.conditionFacts(db, requestId) : {};
  return {
    totalAmount: sumDecimals(lines.map((l) => l.amount)),
    lineCategoryCodes: [...new Set(lines.map((l) => l.category.code))],
    requiredRoleIds: [...new Set(lines.flatMap((l) => l.category.approvalRoles.map((r) => r.roleId)))],
    header: (req.headerValues ?? {}) as Record<string, unknown>,
    department: { code: req.department?.code ?? null },
    module: moduleFacts,
  };
}

export async function recomputeTotals(tx: Db, requestId: string): Promise<void> {
  const lines = await tx.requestLine.findMany({ where: { requestId }, select: { amount: true } });
  await tx.request.update({
    where: { id: requestId },
    data: { totalFinal: sumDecimals(lines.map((l) => l.amount)), lineCount: lines.length },
  });
}

/** quantity = extraValues[quantityFieldKey]; unitPrice = amount / quantity (2dp). */
export function computeQtyPrice(
  quantityFieldKey: string | null | undefined,
  extraValues: Record<string, unknown>,
  amount: string,
): { quantity: string | null; unitPrice: string | null } {
  if (!quantityFieldKey) return { quantity: null, unitPrice: null };
  const raw = extraValues[quantityFieldKey];
  if (raw === undefined || raw === null || raw === '') return { quantity: null, unitPrice: null };
  try {
    const q = dec(normalizeDigits(String(raw)));
    if (q.isNaN() || q.lte(0)) return { quantity: null, unitPrice: null };
    return { quantity: q.toFixed(3), unitPrice: divDecimal(amount, q) };
  } catch {
    return { quantity: null, unitPrice: null };
  }
}

export async function computeWarnings(
  db: Db,
  line: RequestLine,
  category: LineCategory,
  moduleKey: string | null,
): Promise<LineWarning[]> {
  const out: LineWarning[] = [];
  if (line.unitPrice !== null) {
    const up = dec(line.unitPrice);
    if (category.unitPriceMin !== null && up.lt(dec(category.unitPriceMin))) {
      out.push({
        code: 'UNIT_PRICE_LOW',
        messageAr: `سعر الوحدة (${up.toFixed(2)}) أقل من المعتاد`,
        messageEn: `Unit price (${up.toFixed(2)}) is below the expected range`,
      });
    }
    if (category.unitPriceMax !== null && up.gt(dec(category.unitPriceMax))) {
      out.push({
        code: 'UNIT_PRICE_HIGH',
        messageAr: `سعر الوحدة (${up.toFixed(2)}) أعلى من المعتاد`,
        messageEn: `Unit price (${up.toFixed(2)}) is above the expected range`,
      });
    }
  }
  if (category.maxAmountWarning !== null && dec(line.amount).gt(dec(category.maxAmountWarning))) {
    out.push({
      code: 'AMOUNT_ABOVE_LIMIT',
      messageAr: `المبلغ أعلى من الحد المتوقع (${dec(category.maxAmountWarning).toFixed(2)})`,
      messageEn: `Amount exceeds the expected limit (${dec(category.maxAmountWarning).toFixed(2)})`,
    });
  }
  const mod = getModule(moduleKey);
  if (mod?.lineWarnings) out.push(...(await mod.lineWarnings(db, line)));
  return out;
}

/** Recomputes and stores warnings for every line of the request. */
export async function refreshWarnings(tx: Db, requestId: string): Promise<void> {
  const req = await tx.request.findUniqueOrThrow({ where: { id: requestId }, include: { requestType: true } });
  const lines = await tx.requestLine.findMany({ where: { requestId }, include: { category: true } });
  for (const l of lines) {
    const w = await computeWarnings(tx, l, l.category, req.requestType.moduleKey);
    await tx.requestLine.update({ where: { id: l.id }, data: { warnings: toJsonValue(w) ?? [] } });
  }
}

/** Validates values against FieldDefinitions; returns error messages (empty = ok). */
export function validateFieldValues(fields: FieldDefinition[], values: Record<string, unknown>, label: string): string[] {
  const errors: string[] = [];
  for (const f of fields) {
    const raw = values[f.key];
    const empty = raw === undefined || raw === null || String(raw).trim() === '';
    if (empty) {
      if (f.required) errors.push(`${label} "${f.key}" is required`);
      continue;
    }
    const v = String(raw).trim();
    if (f.type === 'number') {
      const n = normalizeDigits(v);
      if (!/^-?\d+(\.\d+)?$/.test(n)) {
        errors.push(`${label} "${f.key}" must be a number`);
        continue;
      }
      if (f.min !== undefined && Number(n) < f.min) errors.push(`${label} "${f.key}" must be >= ${f.min}`);
      if (f.max !== undefined && Number(n) > f.max) errors.push(`${label} "${f.key}" must be <= ${f.max}`);
    } else if (f.type === 'select') {
      if (f.options && !f.options.some((o) => o.value === v)) errors.push(`${label} "${f.key}" is not an allowed option`);
    } else if (f.type === 'date') {
      if (!/^\d{4}-\d{2}-\d{2}/.test(v)) errors.push(`${label} "${f.key}" must be a date (YYYY-MM-DD)`);
    }
    if (f.regex) {
      try {
        if (!new RegExp(f.regex).test(v)) errors.push(`${label} "${f.key}" has an invalid format`);
      } catch {
        /* bad regex in config: ignore */
      }
    }
  }
  return errors;
}

/** Amount check: > 0 (or >= 0 with allowZero), <= 2 decimals; returns the normalised 2dp string. */
export function checkAmount(input: unknown, o: { allowZero?: boolean } = {}): string {
  const s = normalizeDigits(String(input ?? '').trim());
  if (!/^\d+(\.\d+)?$/.test(s)) throw new DomainError('VALIDATION', `Invalid amount "${String(input)}"`);
  if (!hasMaxDecimals(s, 2)) throw new DomainError('VALIDATION', 'Amount must have at most 2 decimals');
  const d = dec(s);
  if (d.isZero() && !o.allowZero) throw new DomainError('VALIDATION', 'Amount must be greater than 0');
  if (d.gt('999999999999.99')) throw new DomainError('VALIDATION', 'Amount too large');
  return d.toFixed(2);
}

export function slaDue(now: Date, slaHours: number | null | undefined): Date | null {
  return slaHours ? new Date(now.getTime() + slaHours * 3600_000) : null;
}
