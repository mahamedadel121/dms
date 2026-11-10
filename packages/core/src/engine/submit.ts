import { Prisma, type PrismaClient } from '@prisma/client';
import {
  cairoDateString,
  cairoYear2,
  fieldDefinitionsSchema,
  formatRequestNumber,
  parseAmount,
  sumDecimals,
  type FieldDefinition,
} from '@dms/shared';
import type { Actor } from '../common';
import { audit, toJsonValue } from '../audit';
import { DomainError } from '../errors';
import { flagDuplicates } from '../media';
import { notifySubmitter, submitterMessages } from '../notifications';
import { advance, instantiateSteps } from './advance';
import { addEvent, computeQtyPrice, refreshWarnings, runTx, validateFieldValues } from './helpers';
import { getModule } from './registry';
import type { SubmitRequestInput } from './types';

function parseFields(raw: unknown): FieldDefinition[] {
  const r = fieldDefinitionsSchema.safeParse(raw ?? []);
  return r.success ? r.data : [];
}

/** Tolerates media.flagDuplicates not being implemented yet / failing: duplicates are advisory only. */
export async function flagDuplicatesSafe(tx: import('../common').Db, requestId: string): Promise<void> {
  try {
    await flagDuplicates(tx, requestId);
  } catch (e) {
    if (e instanceof DomainError && e.code === 'NOT_IMPLEMENTED') return;
    throw e;
  }
}

/**
 * Submits a request (PLAN 5.3): validate, idempotency by clientKey, gap-free number from the row-locked
 * counter, lines, attachments, module hook, steps, first advance. One transaction.
 */
export async function submitRequest(
  prisma: PrismaClient,
  input: SubmitRequestInput,
  actor: Actor,
): Promise<{ id: string; number: string }> {
  if (input.clientKey) {
    const existing = await prisma.request.findUnique({ where: { clientKey: input.clientKey }, select: { id: true, number: true } });
    if (existing) return existing;
  }
  try {
    return await runTx(prisma, (tx) => submitInTx(tx, input, actor));
  } catch (e) {
    // concurrent double-submit with the same clientKey: the loser hits the unique index
    if (input.clientKey && e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const existing = await prisma.request.findUnique({ where: { clientKey: input.clientKey }, select: { id: true, number: true } });
      if (existing) return existing;
    }
    throw e;
  }
}

async function submitInTx(
  tx: Prisma.TransactionClient,
  input: SubmitRequestInput,
  actor: Actor,
): Promise<{ id: string; number: string }> {
  const type = await tx.requestType.findUnique({ where: { code: input.requestTypeCode } });
  if (!type || !type.isActive) throw new DomainError('VALIDATION', `Unknown or inactive request type "${input.requestTypeCode}"`);
  if (!type.channels.includes(input.channel)) {
    throw new DomainError('VALIDATION', `Request type ${type.code} does not accept channel ${input.channel}`);
  }
  if (!input.submitterId && !input.submittedByUserId) throw new DomainError('VALIDATION', 'submitterId or submittedByUserId is required');
  let submitter = null;
  if (input.submitterId) {
    submitter = await tx.submitter.findUnique({ where: { id: input.submitterId } });
    if (!submitter || !submitter.isActive) throw new DomainError('VALIDATION', 'Submitter not found or inactive');
  }
  if (type.hasLines && input.lines.length === 0) throw new DomainError('VALIDATION', 'At least one line is required');

  // header fields
  const headerErrors = validateFieldValues(parseFields(type.headerFields), input.headerValues ?? {}, 'header field');
  if (headerErrors.length) throw new DomainError('VALIDATION', headerErrors[0], undefined, headerErrors);

  // lines
  const categories = await tx.lineCategory.findMany({ where: { requestTypeId: type.id } });
  const catById = new Map(categories.map((c) => [c.id, c]));
  const normalised: { amount: string; cat: (typeof categories)[number] }[] = [];
  for (const [i, l] of input.lines.entries()) {
    const cat = catById.get(l.categoryId);
    if (!cat) throw new DomainError('VALIDATION', `Line ${i + 1}: category does not belong to the request type`);
    if (!cat.isActive) throw new DomainError('VALIDATION', `Line ${i + 1}: category "${cat.code}" is inactive`);
    const amount = parseAmount(l.amount);
    if (!amount) throw new DomainError('VALIDATION', `Line ${i + 1}: amount must be greater than 0 with at most 2 decimals`);
    const errs = validateFieldValues(parseFields(cat.extraFields), l.extraValues ?? {}, `line ${i + 1} field`);
    if (errs.length) throw new DomainError('VALIDATION', errs[0], undefined, errs);
    const n = l.attachmentIds.length;
    if (n < cat.minAttachments) throw new DomainError('VALIDATION', `Line ${i + 1}: at least ${cat.minAttachments} attachment(s) required`);
    if (n > cat.maxAttachments) throw new DomainError('VALIDATION', `Line ${i + 1}: at most ${cat.maxAttachments} attachment(s) allowed`);
    normalised.push({ amount, cat });
  }
  // attachments: must exist, be unattached and belong to the submitter's draft
  const allAttIds = input.lines.flatMap((l) => l.attachmentIds);
  if (new Set(allAttIds).size !== allAttIds.length) throw new DomainError('VALIDATION', 'An attachment is used more than once');
  const atts = allAttIds.length ? await tx.attachment.findMany({ where: { id: { in: allAttIds } } }) : [];
  const attById = new Map(atts.map((a) => [a.id, a]));
  for (const [i, l] of input.lines.entries()) {
    for (const id of l.attachmentIds) {
      const a = attById.get(id);
      if (!a) throw new DomainError('VALIDATION', `Line ${i + 1}: attachment ${id} not found`);
      if (a.requestId) throw new DomainError('VALIDATION', `Line ${i + 1}: attachment ${id} already belongs to a request`);
      const owned =
        (input.submitterId && a.uploadedBySubmitterId === input.submitterId) ||
        (input.submittedByUserId && a.uploadedByUserId === input.submittedByUserId);
      if (!owned) throw new DomainError('FORBIDDEN', `Line ${i + 1}: attachment ${id} is not yours`);
      if (!normalised[i].cat.allowedMimeTypes.includes(a.mimeType)) {
        throw new DomainError('VALIDATION', `Line ${i + 1}: file type ${a.mimeType} is not allowed for this category`);
      }
    }
  }

  const mod = getModule(type.moduleKey);
  if (mod?.validateSubmission) await mod.validateSubmission(tx, input);

  // workflow + template pinning
  const wf = await tx.workflow.findUnique({ where: { requestTypeId: type.id } });
  const wfVersion = wf
    ? await tx.workflowVersion.findFirst({ where: { workflowId: wf.id, status: 'ACTIVE' } })
    : null;
  if (!wfVersion) throw new DomainError('INVALID_STATE', `Request type ${type.code} has no active workflow`);
  const tplVersion =
    (await tx.templateVersion.findFirst({
      where: { status: 'ACTIVE', template: { requestTypeId: type.id, isActive: true, isDefault: true } },
    })) ??
    (await tx.templateVersion.findFirst({
      where: { status: 'ACTIVE', template: { requestTypeId: type.id, isActive: true } },
      orderBy: { createdAt: 'asc' },
    }));
  const sig = input.submitterId
    ? await tx.signature.findFirst({ where: { submitterId: input.submitterId, isActive: true } })
    : null;

  // number (row-locked counter: no gaps on rollback, no duplicates under concurrency)
  const now = new Date();
  const yy = cairoYear2(now);
  const rows = await tx.$queryRaw<{ lastValue: number }[]>`
    INSERT INTO request_number_counters (prefix, year, "lastValue") VALUES (${type.numberPrefix}, ${yy}, 1)
    ON CONFLICT (prefix, year) DO UPDATE SET "lastValue" = request_number_counters."lastValue" + 1
    RETURNING "lastValue"`;
  const number = formatRequestNumber(type.numberPrefix, yy, rows[0].lastValue);

  const total = sumDecimals(normalised.map((n) => n.amount));
  const req = await tx.request.create({
    data: {
      number,
      requestTypeId: type.id,
      departmentId: type.departmentId ?? submitter?.departmentId ?? null,
      workflowVersionId: wfVersion.id,
      templateVersionId: tplVersion?.id ?? null,
      status: 'IN_REVIEW',
      channel: input.channel,
      submitterId: input.submitterId ?? null,
      submittedByUserId: input.submittedByUserId ?? null,
      submitterSignatureId: sig?.id ?? null,
      clientKey: input.clientKey ?? null,
      headerValues: toJsonValue(input.headerValues ?? {}) ?? {},
      totalOriginal: total,
      totalFinal: total,
      lineCount: input.lines.length,
      submittedAt: now,
    },
  });

  const today = new Date(cairoDateString(now));
  const lines = [];
  for (const [i, l] of input.lines.entries()) {
    const { amount, cat } = normalised[i];
    const extra = l.extraValues ?? {};
    const qp = computeQtyPrice(cat.quantityFieldKey, extra, amount);
    const line = await tx.requestLine.create({
      data: {
        requestId: req.id,
        lineNo: i + 1,
        categoryId: cat.id,
        originalCategoryId: cat.id,
        categoryNameAr: cat.nameAr,
        categoryNameEn: cat.nameEn,
        originalAmount: amount,
        amount,
        extraValues: toJsonValue(extra) ?? {},
        originalExtraValues: toJsonValue(extra) ?? {},
        quantity: qp.quantity,
        unitPrice: qp.unitPrice,
        lineDate: l.lineDate ? new Date(l.lineDate.slice(0, 10)) : today,
        note: l.note ?? null,
      },
    });
    lines.push(line);
    if (l.attachmentIds.length) {
      await tx.attachment.updateMany({
        where: { id: { in: l.attachmentIds } },
        data: { requestId: req.id, lineId: line.id, botSessionId: null },
      });
    }
  }

  if (mod?.afterCreate) await mod.afterCreate(tx, req, lines, input);
  await refreshWarnings(tx, req.id);
  await flagDuplicatesSafe(tx, req.id);
  await addEvent(tx, { requestId: req.id, type: 'SUBMITTED', actor, data: { channel: input.channel, total } });
  await instantiateSteps(tx, req, actor);
  await advance(tx, req.id, actor, now);
  if (req.submitterId) {
    await notifySubmitter(tx, {
      submitterId: req.submitterId,
      type: 'REQ_SUBMITTED',
      requestId: req.id,
      bodyAr: submitterMessages.REQ_SUBMITTED(number),
      data: { requestNumber: number },
    });
  }
  await audit(tx, { actor, action: 'request.submit', entityType: 'Request', entityId: req.id, after: { number, total } });
  return { id: req.id, number };
}
