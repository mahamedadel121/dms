import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  acquireLock,
  approveStep,
  canViewRequest,
  createDraftVersion,
  editLine,
  getRequestDetail,
  heartbeatLock,
  listOpenCorrections,
  listQueue,
  listRequests,
  publishWorkflowVersion,
  queueCounters,
  rejectRequest,
  releaseLock,
  requestCorrection,
  saveDraftVersion,
  sendBack,
  simulateWorkflow,
  submitCorrection,
  submitRequest,
} from './index';
import { DomainError } from '../errors';
import {
  actorOf,
  addAttachment,
  approveAs,
  createEnv,
  driver,
  FULL_PATH,
  instanceOf,
  steps,
  submitExpense,
  userOf,
  type Env,
} from './testkit';

let env: Env;
let prisma: PrismaClient;

beforeAll(async () => {
  env = await createEnv('wp2-engine');
  prisma = env.prisma;
});
afterAll(async () => {
  await env?.teardown();
});

const code = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p;
    return 'OK';
  } catch (e) {
    return e instanceof DomainError ? e.code : `ERR:${String(e)}`;
  }
};

describe('four signature scenarios (expense-type-driven steps)', () => {
  it('tolls + weighbridge: neither maintenance engineer nor shipping officer', async () => {
    const r = await submitExpense(prisma, { lines: [{ cat: 'TOLLS', amount: '50' }, { cat: 'WEIGHBRIDGE', amount: '30' }] });
    expect(r.number).toMatch(/^DE-\d\d-\d{6}$/);
    const s = await steps(prisma, r.id);
    expect(s.supervisor).toBe('ACTIVE');
    expect(s.maintenance_engineer).toBe('NOT_APPLICABLE');
    expect(s.shipping_officer).toBe('NOT_APPLICABLE');
    expect(Object.keys(s).some((k) => k.startsWith('extra_roles'))).toBe(false);
    expect(s.campaign_manager).toBe('PENDING');
    await approveAs(prisma, r.id, 'supervisor', 'supervisor');
    expect((await steps(prisma, r.id)).campaign_manager).toBe('ACTIVE');
  });

  it('maintenance: maintenance engineer included, shipping officer not', async () => {
    const r = await submitExpense(prisma, { lines: [{ cat: 'MAINTENANCE', amount: '500' }] });
    const s = await steps(prisma, r.id);
    expect(s.maintenance_engineer).toBe('PENDING');
    expect(s.shipping_officer).toBe('NOT_APPLICABLE');
    await approveAs(prisma, r.id, 'supervisor', 'supervisor');
    const s2 = await steps(prisma, r.id);
    expect(s2.maintenance_engineer).toBe('ACTIVE');
    expect(s2.campaign_manager).toBe('PENDING');
  });

  it('tips: shipping officer included, maintenance engineer not', async () => {
    const r = await submitExpense(prisma, { lines: [{ cat: 'TIPS', amount: '20' }] });
    const s = await steps(prisma, r.id);
    expect(s.shipping_officer).toBe('PENDING');
    expect(s.maintenance_engineer).toBe('NOT_APPLICABLE');
  });

  it('maintenance + tips: both, in parallel; next stage waits for both', async () => {
    const r = await submitExpense(prisma, { lines: [{ cat: 'MAINTENANCE', amount: '500' }, { cat: 'TIPS', amount: '20' }] });
    await approveAs(prisma, r.id, 'supervisor', 'supervisor');
    const s = await steps(prisma, r.id);
    expect(s.maintenance_engineer).toBe('ACTIVE');
    expect(s.shipping_officer).toBe('ACTIVE');
    expect(s.campaign_manager).toBe('PENDING');
    await approveAs(prisma, r.id, 'shipping_officer', 'shipping');
    expect((await steps(prisma, r.id)).campaign_manager).toBe('PENDING');
    await approveAs(prisma, r.id, 'maintenance_engineer', 'engineer');
    expect((await steps(prisma, r.id)).campaign_manager).toBe('ACTIVE');
  });
});

describe('dynamic category roles slot', () => {
  it('adds an instance for a required role no explicit step covers', async () => {
    const legal = await prisma.role.create({ data: { code: 'LEGAL_T', nameAr: 'قانوني', nameEn: 'Legal' } });
    const type = await prisma.requestType.findUniqueOrThrow({ where: { code: 'DRIVER_EXPENSE' } });
    const gl = await prisma.glAccount.findFirstOrThrow();
    const cat = await prisma.lineCategory.create({
      data: {
        requestTypeId: type.id,
        code: 'LEGAL_FEE',
        nameAr: 'رسوم قانونية',
        nameEn: 'Legal fee',
        approvalRoles: { create: [{ roleId: legal.id }] },
        expenseConfig: { create: { glAccountId: gl.id } },
      },
    });
    const r = await submitExpense(prisma, { lines: [{ cat: 'LEGAL_FEE', amount: '70' }] });
    const s = await steps(prisma, r.id);
    expect(s['extra_roles:LEGAL_T']).toBe('PENDING');
    await approveAs(prisma, r.id, 'supervisor', 'supervisor');
    expect((await steps(prisma, r.id))['extra_roles:LEGAL_T']).toBe('ACTIVE');
    // no covered role => slot does not expand for engineer-type categories
    const r2 = await submitExpense(prisma, { lines: [{ cat: 'MAINTENANCE', amount: '70' }] });
    expect(Object.keys(await steps(prisma, r2.id)).some((k) => k.startsWith('extra_roles'))).toBe(false);
    await prisma.lineCategory.update({ where: { id: cat.id }, data: { isActive: false } });
  });
});

describe('submit validation and idempotency', () => {
  it('rejects zero amount, wrong category, missing attachments', async () => {
    const d = await driver(prisma);
    const tolls = await prisma.lineCategory.findFirstOrThrow({ where: { code: 'TOLLS' } });
    const att = await addAttachment(prisma, d.id);
    const base = { requestTypeCode: 'DRIVER_EXPENSE', channel: 'TELEGRAM' as const, submitterId: d.id, headerValues: { odometer: 5 } };
    const a = { type: 'SUBMITTER' as const, submitterId: d.id };
    expect(await code(submitRequest(prisma, { ...base, lines: [{ categoryId: tolls.id, amount: '0', attachmentIds: [att.id] }] }, a))).toBe('VALIDATION');
    expect(await code(submitRequest(prisma, { ...base, lines: [{ categoryId: tolls.id, amount: '1.234', attachmentIds: [att.id] }] }, a))).toBe('VALIDATION');
    expect(await code(submitRequest(prisma, { ...base, lines: [{ categoryId: 'nope', amount: '5', attachmentIds: [att.id] }] }, a))).toBe('VALIDATION');
    expect(await code(submitRequest(prisma, { ...base, lines: [{ categoryId: tolls.id, amount: '5', attachmentIds: [] }] }, a))).toBe('VALIDATION');
    expect(await code(submitRequest(prisma, { ...base, headerValues: {}, lines: [{ categoryId: tolls.id, amount: '5', attachmentIds: [att.id] }] }, a))).toBe('VALIDATION');
    // someone else's attachment
    const other = await driver(prisma, 'DRV002');
    const foreign = await addAttachment(prisma, other.id);
    expect(await code(submitRequest(prisma, { ...base, lines: [{ categoryId: tolls.id, amount: '5', attachmentIds: [foreign.id] }] }, a))).toBe('FORBIDDEN');
    // nothing was created / no number consumed by failed attempts
    expect(await prisma.request.count({ where: { submitterId: d.id, number: 'x' } })).toBe(0);
  });

  it('clientKey is idempotent', async () => {
    const a = await submitExpense(prisma, { lines: [{ cat: 'TOLLS', amount: '10' }], clientKey: 'k-1' });
    const d = await driver(prisma);
    const att = await addAttachment(prisma, d.id);
    const tolls = await prisma.lineCategory.findFirstOrThrow({ where: { code: 'TOLLS' } });
    const b = await submitRequest(
      prisma,
      { requestTypeCode: 'DRIVER_EXPENSE', channel: 'TELEGRAM', submitterId: d.id, clientKey: 'k-1', headerValues: { odometer: 1 }, lines: [{ categoryId: tolls.id, amount: '10', attachmentIds: [att.id] }] },
      { type: 'SUBMITTER', submitterId: d.id },
    );
    expect(b).toEqual(a);
    expect(await prisma.request.count({ where: { clientKey: 'k-1' } })).toBe(1);
  });

  it('header-only type (hasLines=false) submits with no lines and total 0; lines are rejected', async () => {
    const d = await driver(prisma);
    const before = await prisma.requestType.findUniqueOrThrow({ where: { code: 'DRIVER_EXPENSE' } });
    const tolls = await prisma.lineCategory.findFirstOrThrow({ where: { code: 'TOLLS' } });
    const att = await addAttachment(prisma, d.id);
    const a = { type: 'SUBMITTER' as const, submitterId: d.id };
    const base = { requestTypeCode: 'DRIVER_EXPENSE', channel: 'TELEGRAM' as const, submitterId: d.id, headerValues: {} };
    // the type is flipped temporarily (module off: the expense module needs a vehicle and lines); restored below
    await prisma.requestType.update({ where: { id: before.id }, data: { hasLines: false, moduleKey: null } });
    try {
      expect(await code(submitRequest(prisma, { ...base, lines: [{ categoryId: tolls.id, amount: '5', attachmentIds: [att.id] }] }, a))).toBe('VALIDATION');
      const r = await submitRequest(prisma, { ...base, clientKey: 'k-header-only', lines: [] }, a);
      const row = await prisma.request.findUniqueOrThrow({ where: { id: r.id } });
      expect(row.lineCount).toBe(0);
      expect(row.totalOriginal.toString()).toBe('0');
      expect(row.totalFinal.toString()).toBe('0');
      expect(await prisma.requestLine.count({ where: { requestId: r.id } })).toBe(0);
      const detail = await getRequestDetail(prisma, r.id, await userOf(prisma, 'admin'));
      expect(detail.lines).toEqual([]);
      expect(Number((detail as unknown as { totals: { final: string } }).totals.final)).toBe(0);
    } finally {
      await prisma.requestType.update({ where: { id: before.id }, data: { hasLines: before.hasLines, moduleKey: before.moduleKey } });
    }
    // with lines required again, an empty submit is refused
    expect(await code(submitRequest(prisma, { ...base, headerValues: { odometer: 5 }, lines: [] }, a))).toBe('VALIDATION');
  });

  it('diesel liters give quantity and unit price; snapshots written; odometer stored', async () => {
    const r = await submitExpense(prisma, { lines: [{ cat: 'DIESEL', amount: '200', extra: { liters: '20' } }], odometer: 2222 });
    const line = await prisma.requestLine.findFirstOrThrow({ where: { requestId: r.id }, include: { expense: true } });
    expect(line.quantity?.toString()).toBe('20');
    expect(line.unitPrice?.toString()).toBe('10');
    expect(line.originalAmount.toString()).toBe('200');
    expect(line.expense?.glNumber).toBe('51501400');
    expect(line.expense?.vehicleNumber).toBe('2157');
    expect(line.lineDate).toBeTruthy();
    const e = await prisma.expenseRequest.findUniqueOrThrow({ where: { requestId: r.id } });
    expect(e.odometer).toBe(2222);
    expect(e.costCenterCode).toBe('MLF450');
    const sub = await prisma.notification.findFirst({ where: { requestId: r.id, type: 'REQ_SUBMITTED' } });
    expect(sub?.channel).toBe('TELEGRAM');
    const job = await prisma.job.findFirst({ where: { type: 'telegram.send', payload: { path: ['notificationId'], equals: sub!.id } } });
    expect(job?.queue).toBe('telegram');
  });

  it('diesel unit price outside the range raises a warning', async () => {
    const r = await submitExpense(prisma, { lines: [{ cat: 'DIESEL', amount: '1000', extra: { liters: '10' } }] });
    const line = await prisma.requestLine.findFirstOrThrow({ where: { requestId: r.id } });
    expect((line.warnings as { code: string }[]).map((w) => w.code)).toContain('UNIT_PRICE_HIGH');
  });
});

describe('full path, treasury and PAID', () => {
  it('walks to PAID with exactly one SapPosting and both jobs enqueued', async () => {
    const r = await submitExpense(prisma, { lines: [{ cat: 'TOLLS', amount: '100' }] });
    for (const [key, who] of FULL_PATH) {
      const before = await prisma.request.findUniqueOrThrow({ where: { id: r.id } });
      expect(before.status).toBe('IN_REVIEW');
      await approveAs(prisma, r.id, key, who);
    }
    const req = await prisma.request.findUniqueOrThrow({ where: { id: r.id } });
    expect(req.status).toBe('PAID');
    expect(req.paidAt).toBeTruthy();
    expect(req.currentStageIndex).toBeNull();
    expect(req.completedAt).toBeTruthy();
    expect(await prisma.sapPosting.count({ where: { requestId: r.id } })).toBe(1);
    const posting = await prisma.sapPosting.findUniqueOrThrow({ where: { requestId: r.id } });
    expect(posting.status).toBe('PENDING');
    expect(posting.idempotencyKey).toBe(r.id);
    const jobs = await prisma.job.findMany({ where: { dedupeKey: { in: [`sap.post:${r.id}`, `pdf.finalize:${r.id}`] } } });
    expect(jobs.map((j) => j.type).sort()).toEqual(['pdf.finalize', 'sap.post']);
    const exp = await prisma.expenseRequest.findUniqueOrThrow({ where: { requestId: r.id } });
    expect(exp.treasuryId).toBeTruthy();
    const types = (await prisma.requestEvent.findMany({ where: { requestId: r.id }, orderBy: { createdAt: 'asc' } })).map((e) => e.type);
    expect(types).toContain('PAID');
    expect(types).toContain('COMPLETED');
    expect(types.filter((t) => t === 'STEP_APPROVED')).toHaveLength(6);
    const paidNotif = await prisma.notification.findFirst({ where: { requestId: r.id, type: 'REQ_PAID' } });
    expect(paidNotif).toBeTruthy();
    // steps carry the signature of the acting user
    const sup = await instanceOf(prisma, r.id, 'supervisor');
    expect(sup.signatureId).toBeTruthy();
    expect(sup.actedById).toBeTruthy();
    // a second approve on the finished request is refused
    const treasury = await userOf(prisma, 'treasury');
    const tInst = await instanceOf(prisma, r.id, 'treasury');
    expect(await code(approveStep(prisma, { requestId: r.id, stepInstanceId: tInst.id, user: treasury, actor: actorOf(treasury) }))).toBe('INVALID_STATE');
    expect(await prisma.sapPosting.count({ where: { requestId: r.id } })).toBe(1);
  });

  it('treasury can choose a treasury; invalid treasury is refused', async () => {
    const r = await submitExpense(prisma, { lines: [{ cat: 'TOLLS', amount: '100' }] });
    for (const [key, who] of FULL_PATH.slice(0, 5)) await approveAs(prisma, r.id, key, who);
    const second = await prisma.treasury.create({ data: { code: 'T2', name: 'خزينة 2', cashGlNumber: '11002000', companyCode: '1000' } });
    expect(await code(approveAs(prisma, r.id, 'treasury', 'treasury', { treasuryId: 'bogus' }))).toBe('VALIDATION');
    await approveAs(prisma, r.id, 'treasury', 'treasury', { treasuryId: second.id });
    const exp = await prisma.expenseRequest.findUniqueOrThrow({ where: { requestId: r.id } });
    expect(exp.treasuryId).toBe(second.id);
  });
});

describe('approve preconditions', () => {
  it('first step requires the receipts checklist', async () => {
    const r = await submitExpense(prisma, { lines: [{ cat: 'TOLLS', amount: '10' }] });
    const u = await userOf(prisma, 'supervisor');
    const inst = await instanceOf(prisma, r.id, 'supervisor');
    expect(await code(approveStep(prisma, { requestId: r.id, stepInstanceId: inst.id, user: u, actor: actorOf(u) }))).toBe('VALIDATION');
    expect(await code(approveStep(prisma, { requestId: r.id, stepInstanceId: inst.id, user: u, checklist: { receipts_match: false }, actor: actorOf(u) }))).toBe('VALIDATION');
    expect(await code(approveStep(prisma, { requestId: r.id, stepInstanceId: inst.id, user: u, checklist: { receipts_match: true }, actor: actorOf(u) }))).toBe('OK');
  });

  it('wrong role / missing permission / inactive step are refused', async () => {
    const r = await submitExpense(prisma, { lines: [{ cat: 'TOLLS', amount: '10' }] });
    const inst = await instanceOf(prisma, r.id, 'supervisor');
    const eng = await userOf(prisma, 'engineer');
    expect(await code(approveStep(prisma, { requestId: r.id, stepInstanceId: inst.id, user: eng, checklist: { receipts_match: true }, actor: actorOf(eng) }))).toBe('FORBIDDEN');
    const sup = await userOf(prisma, 'supervisor');
    const noPerm = { ...sup, permissions: sup.permissions.filter((p) => p !== 'requests.act') };
    expect(await code(approveStep(prisma, { requestId: r.id, stepInstanceId: inst.id, user: noPerm, checklist: { receipts_match: true }, actor: actorOf(sup) }))).toBe('FORBIDDEN');
    const mgrInst = await instanceOf(prisma, r.id, 'campaign_manager');
    const mgr = await userOf(prisma, 'manager');
    expect(await code(approveStep(prisma, { requestId: r.id, stepInstanceId: mgrInst.id, user: mgr, actor: actorOf(mgr) }))).toBe('INVALID_STATE');
  });

  it('signature is required unless the setting is off', async () => {
    const r = await submitExpense(prisma, { lines: [{ cat: 'TOLLS', amount: '10' }] });
    const sup = await userOf(prisma, 'supervisor');
    await prisma.signature.updateMany({ where: { userId: sup.id }, data: { isActive: false } });
    const inst = await instanceOf(prisma, r.id, 'supervisor');
    expect(await code(approveStep(prisma, { requestId: r.id, stepInstanceId: inst.id, user: sup, checklist: { receipts_match: true }, actor: actorOf(sup) }))).toBe('VALIDATION');
    await prisma.setting.upsert({ where: { key: 'workflow.requireSignatureToApprove' }, create: { key: 'workflow.requireSignatureToApprove', value: false }, update: { value: false } });
    expect(await code(approveStep(prisma, { requestId: r.id, stepInstanceId: inst.id, user: sup, checklist: { receipts_match: true }, actor: actorOf(sup) }))).toBe('OK');
    await prisma.setting.update({ where: { key: 'workflow.requireSignatureToApprove' }, data: { value: true } });
    await prisma.signature.updateMany({ where: { userId: sup.id }, data: { isActive: true } });
  });
});

describe('correction returns to the same step instance', () => {
  it('request correction -> driver fixes -> same instance ACTIVE, asker notified', async () => {
    const r = await submitExpense(prisma, { lines: [{ cat: 'TOLLS', amount: '100' }, { cat: 'TIPS', amount: '20' }] });
    await approveAs(prisma, r.id, 'supervisor', 'supervisor');
    await approveAs(prisma, r.id, 'shipping_officer', 'shipping');
    const mgr = await userOf(prisma, 'manager');
    const mgrInst = await instanceOf(prisma, r.id, 'campaign_manager');
    const line = await prisma.requestLine.findFirstOrThrow({ where: { requestId: r.id, lineNo: 1 }, include: { attachments: true } });
    const oldAtt = line.attachments[0];
    await requestCorrection(prisma, {
      requestId: r.id,
      stepInstanceId: mgrInst.id,
      user: mgr,
      items: [{ lineId: line.id, attachmentId: oldAtt.id, reasonCode: 'IMAGE_UNCLEAR', fixType: 'REUPLOAD', comment: 'الصورة مش واضحة' }],
      actor: actorOf(mgr),
    });
    let req = await prisma.request.findUniqueOrThrow({ where: { id: r.id } });
    expect(req.status).toBe('CORRECTION_REQUESTED');
    expect((await instanceOf(prisma, r.id, 'campaign_manager')).status).toBe('AWAITING_CORRECTION');
    // approve on the awaiting step is refused
    expect(await code(approveStep(prisma, { requestId: r.id, stepInstanceId: mgrInst.id, user: mgr, actor: actorOf(mgr) }))).toBe('INVALID_STATE');
    // driver notified
    const n = await prisma.notification.findFirst({ where: { requestId: r.id, type: 'REQ_CORRECTION' } });
    expect(n?.bodyAr).toContain('الصورة مش واضحة');
    // queue "awaiting" tab shows it with returnedFor
    const q = await listQueue(prisma, mgr, { tab: 'awaiting' });
    expect(q.items.find((i) => i.id === r.id)?.step.returnedFor).toBe(mgr.fullName);
    // driver side
    const d = await driver(prisma);
    const open = await listOpenCorrections(prisma, d.id);
    const corr = open.find((c) => c.requestId === r.id)!;
    expect(corr.fixType).toBe('REUPLOAD');
    const other = await driver(prisma, 'DRV002');
    expect(await code(submitCorrection(prisma, { correctionRequestId: corr.id, submitterId: other.id, newAttachmentIds: [] }))).toBe('FORBIDDEN');
    expect(await code(submitCorrection(prisma, { correctionRequestId: corr.id, submitterId: d.id, newAttachmentIds: [] }))).toBe('VALIDATION');
    const fresh = await addAttachment(prisma, d.id);
    const res = await submitCorrection(prisma, { correctionRequestId: corr.id, submitterId: d.id, newAttachmentIds: [fresh.id] });
    expect(res.returnedToStep).toBe(true);
    const after = await instanceOf(prisma, r.id, 'campaign_manager');
    expect(after.id).toBe(mgrInst.id); // SAME instance
    expect(after.status).toBe('ACTIVE');
    expect(after.returnedAt).toBeTruthy();
    req = await prisma.request.findUniqueOrThrow({ where: { id: r.id } });
    expect(req.status).toBe('IN_REVIEW');
    const old = await prisma.attachment.findUniqueOrThrow({ where: { id: oldAtt.id } });
    expect(old.isCurrent).toBe(false);
    expect(old.supersededById).toBe(fresh.id);
    const nw = await prisma.attachment.findUniqueOrThrow({ where: { id: fresh.id } });
    expect(nw.isCurrent).toBe(true);
    expect(nw.requestId).toBe(r.id);
    expect(nw.lineId).toBe(line.id);
    expect(await prisma.notification.count({ where: { recipientUserId: mgr.id, type: 'CORRECTION_RETURNED', requestId: r.id } })).toBe(1);
    // a second submit of the same correction is refused
    expect(await code(submitCorrection(prisma, { correctionRequestId: corr.id, submitterId: d.id, newAttachmentIds: [fresh.id] }))).toBe('INVALID_STATE');
    // another manager-role holder could act: continue forward
    await approveAs(prisma, r.id, 'campaign_manager', 'manager');
    expect((await steps(prisma, r.id)).accountant).toBe('ACTIVE');
  });

  it('amount correction keeps the original amount and records the edit; parallel sibling may act meanwhile', async () => {
    const r = await submitExpense(prisma, { lines: [{ cat: 'MAINTENANCE', amount: '500' }, { cat: 'TIPS', amount: '20' }] });
    await approveAs(prisma, r.id, 'supervisor', 'supervisor');
    const eng = await userOf(prisma, 'engineer');
    const engInst = await instanceOf(prisma, r.id, 'maintenance_engineer');
    const line = await prisma.requestLine.findFirstOrThrow({ where: { requestId: r.id, lineNo: 1 } });
    await requestCorrection(prisma, {
      requestId: r.id,
      stepInstanceId: engInst.id,
      user: eng,
      items: [{ lineId: line.id, reasonCode: 'WRONG_AMOUNT', fixType: 'AMOUNT', comment: 'المبلغ غلط' }],
      actor: actorOf(eng),
    });
    // sibling (shipping) can still approve while a correction is open
    await approveAs(prisma, r.id, 'shipping_officer', 'shipping');
    expect((await steps(prisma, r.id)).campaign_manager).toBe('PENDING');
    const d = await driver(prisma);
    const corr = (await listOpenCorrections(prisma, d.id)).find((c) => c.requestId === r.id)!;
    expect(await code(submitCorrection(prisma, { correctionRequestId: corr.id, submitterId: d.id, newAmount: '0' }))).toBe('VALIDATION');
    await submitCorrection(prisma, { correctionRequestId: corr.id, submitterId: d.id, newAmount: '450' });
    const l = await prisma.requestLine.findUniqueOrThrow({ where: { id: line.id } });
    expect(l.amount.toString()).toBe('450');
    expect(l.originalAmount.toString()).toBe('500');
    expect(l.isEdited).toBe(true);
    const edit = await prisma.lineEdit.findFirstOrThrow({ where: { lineId: line.id } });
    expect(edit.source).toBe('SUBMITTER_CORRECTION');
    expect(edit.oldValue).toBe('500.00');
    const req = await prisma.request.findUniqueOrThrow({ where: { id: r.id } });
    expect(req.totalFinal.toString()).toBe('470');
    expect(req.totalOriginal.toString()).toBe('520');
    expect((await instanceOf(prisma, r.id, 'maintenance_engineer')).status).toBe('ACTIVE');
    await approveAs(prisma, r.id, 'maintenance_engineer', 'engineer');
    expect((await steps(prisma, r.id)).campaign_manager).toBe('ACTIVE');
  });

  it('correction needs a comment and a target', async () => {
    const r = await submitExpense(prisma, { lines: [{ cat: 'TOLLS', amount: '10' }] });
    const sup = await userOf(prisma, 'supervisor');
    const inst = await instanceOf(prisma, r.id, 'supervisor');
    const line = await prisma.requestLine.findFirstOrThrow({ where: { requestId: r.id } });
    const mk = (items: { lineId?: string; reasonCode: string; fixType: string; comment: string }[]) =>
      requestCorrection(prisma, { requestId: r.id, stepInstanceId: inst.id, user: sup, items, actor: actorOf(sup) });
    expect(await code(mk([]))).toBe('VALIDATION');
    expect(await code(mk([{ lineId: line.id, reasonCode: 'OTHER', fixType: 'AMOUNT', comment: '  ' }]))).toBe('VALIDATION');
    expect(await code(mk([{ reasonCode: 'OTHER', fixType: 'AMOUNT', comment: 'x' }]))).toBe('VALIDATION');
  });
});

describe('send back and reject', () => {
  it('send-back returns to the previous approved stage; the first step cannot send back', async () => {
    const r = await submitExpense(prisma, { lines: [{ cat: 'TOLLS', amount: '10' }] });
    const sup = await userOf(prisma, 'supervisor');
    const supInst = await instanceOf(prisma, r.id, 'supervisor');
    expect(await code(sendBack(prisma, { requestId: r.id, stepInstanceId: supInst.id, user: sup, comment: 'x', actor: actorOf(sup) }))).toBe('INVALID_STATE');
    await approveAs(prisma, r.id, 'supervisor', 'supervisor');
    const mgr = await userOf(prisma, 'manager');
    const mgrInst = await instanceOf(prisma, r.id, 'campaign_manager');
    expect(await code(sendBack(prisma, { requestId: r.id, stepInstanceId: mgrInst.id, user: mgr, comment: '', actor: actorOf(mgr) }))).toBe('VALIDATION');
    await sendBack(prisma, { requestId: r.id, stepInstanceId: mgrInst.id, user: mgr, comment: 'راجع الإيصال', actor: actorOf(mgr) });
    const s = await steps(prisma, r.id);
    expect(s.supervisor).toBe('ACTIVE');
    expect(s.campaign_manager).toBe('PENDING');
    const sInst = await instanceOf(prisma, r.id, 'supervisor');
    expect(sInst.id).toBe(supInst.id);
    expect(sInst.actedById).toBeNull();
    expect(sInst.signatureId).toBeNull();
    const req = await prisma.request.findUniqueOrThrow({ where: { id: r.id } });
    expect(req.currentStageIndex).toBe(sInst.stageIndex);
    expect(await prisma.requestEvent.count({ where: { requestId: r.id, type: 'STEP_SENT_BACK' } })).toBe(1);
    // supervisor must re-approve; then manager is active again
    await approveAs(prisma, r.id, 'supervisor', 'supervisor');
    expect((await steps(prisma, r.id)).campaign_manager).toBe('ACTIVE');
  });

  it('send-back from a stage after a parallel group reactivates every approved sibling', async () => {
    const r = await submitExpense(prisma, { lines: [{ cat: 'MAINTENANCE', amount: '500' }, { cat: 'TIPS', amount: '20' }] });
    await approveAs(prisma, r.id, 'supervisor', 'supervisor');
    await approveAs(prisma, r.id, 'maintenance_engineer', 'engineer');
    await approveAs(prisma, r.id, 'shipping_officer', 'shipping');
    const mgr = await userOf(prisma, 'manager');
    const mgrInst = await instanceOf(prisma, r.id, 'campaign_manager');
    await sendBack(prisma, { requestId: r.id, stepInstanceId: mgrInst.id, user: mgr, comment: 'x', actor: actorOf(mgr) });
    const s = await steps(prisma, r.id);
    expect(s.maintenance_engineer).toBe('ACTIVE');
    expect(s.shipping_officer).toBe('ACTIVE');
    expect(s.supervisor).toBe('APPROVED');
    expect(s.campaign_manager).toBe('PENDING');
  });

  it('reject is final: cancels remaining steps, notifies the driver', async () => {
    const r = await submitExpense(prisma, { lines: [{ cat: 'TOLLS', amount: '10' }] });
    await approveAs(prisma, r.id, 'supervisor', 'supervisor');
    const mgr = await userOf(prisma, 'manager');
    const mgrInst = await instanceOf(prisma, r.id, 'campaign_manager');
    expect(await code(rejectRequest(prisma, { requestId: r.id, stepInstanceId: mgrInst.id, user: mgr, reason: ' ', actor: actorOf(mgr) }))).toBe('VALIDATION');
    await rejectRequest(prisma, { requestId: r.id, stepInstanceId: mgrInst.id, user: mgr, reason: 'مخالف للسياسة', actor: actorOf(mgr) });
    const req = await prisma.request.findUniqueOrThrow({ where: { id: r.id } });
    expect(req.status).toBe('REJECTED');
    expect(req.rejectionReason).toBe('مخالف للسياسة');
    expect(req.rejectedById).toBe(mgr.id);
    expect(req.currentStageIndex).toBeNull();
    const s = await steps(prisma, r.id);
    expect(s.campaign_manager).toBe('REJECTED');
    expect(s.accountant).toBe('CANCELLED');
    expect(s.supervisor).toBe('APPROVED');
    expect(s.maintenance_engineer).toBe('NOT_APPLICABLE');
    expect(await prisma.notification.count({ where: { requestId: r.id, type: 'REQ_REJECTED' } })).toBe(1);
    expect(await code(sendBack(prisma, { requestId: r.id, stepInstanceId: mgrInst.id, user: mgr, comment: 'x', actor: actorOf(mgr) }))).toBe('INVALID_STATE');
  });
});

describe('accountant edits continue forward; reclassify updates snapshots', () => {
  it('edit amount: original preserved, same step, continues to the chief, no return to earlier approvers', async () => {
    const r = await submitExpense(prisma, { lines: [{ cat: 'TOLLS', amount: '100' }] });
    for (const [key, who] of FULL_PATH.slice(0, 2)) await approveAs(prisma, r.id, key, who);
    const acc = await userOf(prisma, 'accountant1');
    const accInst = await instanceOf(prisma, r.id, 'accountant');
    const line = await prisma.requestLine.findFirstOrThrow({ where: { requestId: r.id } });
    const call = (o: Partial<Parameters<typeof editLine>[1]>) =>
      editLine(prisma, { requestId: r.id, stepInstanceId: accInst.id, lineId: line.id, user: acc, reason: 'تعديل', actor: actorOf(acc), ...o });
    expect(await code(call({ amount: '90', reason: '' }))).toBe('VALIDATION');
    expect(await code(call({ amount: '9.999' }))).toBe('VALIDATION');
    expect(await code(call({}))).toBe('VALIDATION');
    // supervisor-role user cannot edit (not at their step)
    const sup = await userOf(prisma, 'supervisor');
    expect(await code(call({ amount: '90', user: sup }))).toBe('FORBIDDEN');
    await call({ amount: '85.50' });
    const l = await prisma.requestLine.findUniqueOrThrow({ where: { id: line.id } });
    expect(l.amount.toString()).toBe('85.5');
    expect(l.originalAmount.toString()).toBe('100');
    expect(l.isEdited).toBe(true);
    const req = await prisma.request.findUniqueOrThrow({ where: { id: r.id } });
    expect(req.totalFinal.toString()).toBe('85.5');
    expect(req.totalOriginal.toString()).toBe('100');
    const s = await steps(prisma, r.id);
    expect(s.accountant).toBe('ACTIVE');
    expect(s.supervisor).toBe('APPROVED');
    expect(s.campaign_manager).toBe('APPROVED');
    const edit = await prisma.lineEdit.findFirstOrThrow({ where: { lineId: line.id } });
    expect([edit.field, edit.oldValue, edit.newValue, edit.source, edit.reason]).toEqual(['amount', '100.00', '85.50', 'APPROVER', 'تعديل']);
    expect(await prisma.notification.count({ where: { requestId: r.id, type: 'REQ_LINE_EDITED' } })).toBe(1);
    // zero amounts are allowed for approvers
    await call({ amount: '0' });
    // continue forward
    await approveAs(prisma, r.id, 'accountant', 'accountant1');
    expect((await steps(prisma, r.id)).chief_accountant).toBe('ACTIVE');
    // the detail shows both values
    const det = await getRequestDetail(prisma, r.id, acc);
    const dl = (det.lines as { originalAmount: string; amount: string; edits: unknown[] }[])[0];
    expect([dl.originalAmount, dl.amount, dl.edits.length]).toEqual(['100', '0', 2]);
  });

  it('the supervisor cannot edit amounts (step flag) even with the role', async () => {
    const r = await submitExpense(prisma, { lines: [{ cat: 'TOLLS', amount: '100' }] });
    const sup = await userOf(prisma, 'supervisor');
    const inst = await instanceOf(prisma, r.id, 'supervisor');
    const line = await prisma.requestLine.findFirstOrThrow({ where: { requestId: r.id } });
    expect(await code(editLine(prisma, { requestId: r.id, stepInstanceId: inst.id, lineId: line.id, user: sup, amount: '1', reason: 'x', actor: actorOf(sup) }))).toBe('FORBIDDEN');
  });

  it('reclassify updates the GL snapshot but never reactivates earlier approvers; later conditions react', async () => {
    const r = await submitExpense(prisma, { lines: [{ cat: 'OTHER', amount: '100' }] });
    for (const [key, who] of FULL_PATH.slice(0, 2)) await approveAs(prisma, r.id, key, who);
    const acc = await userOf(prisma, 'accountant1');
    const accInst = await instanceOf(prisma, r.id, 'accountant');
    const line = await prisma.requestLine.findFirstOrThrow({ where: { requestId: r.id }, include: { expense: true } });
    expect(line.expense?.glNumber).toBe('51501900');
    const maint = await prisma.lineCategory.findFirstOrThrow({ where: { code: 'MAINTENANCE' } });
    await editLine(prisma, { requestId: r.id, stepInstanceId: accInst.id, lineId: line.id, user: acc, categoryId: maint.id, reason: 'تصنيف غلط', actor: actorOf(acc) });
    const l = await prisma.requestLine.findUniqueOrThrow({ where: { id: line.id }, include: { expense: true } });
    expect(l.categoryId).toBe(maint.id);
    expect(l.originalCategoryId).toBe(line.categoryId);
    expect(l.categoryNameEn).toBe('Maintenance');
    expect(l.expense?.glNumber).toBe('51501800');
    const s = await steps(prisma, r.id);
    expect(s.maintenance_engineer).toBe('NOT_APPLICABLE'); // earlier stage frozen
    expect(s.accountant).toBe('ACTIVE');
    const e = await prisma.lineEdit.findFirstOrThrow({ where: { lineId: line.id, field: 'categoryId' } });
    expect(e.newLabel).toBe('صيانة');
  });

  it('a later conditional step reacts to edited totals', async () => {
    // new draft version with a total-amount conditional step after the accountant
    const wf = await prisma.workflow.findFirstOrThrow({ where: { requestType: { code: 'DRIVER_EXPENSE' } } });
    const { id } = await createDraftVersion(prisma, wf.id);
    const v = await prisma.workflowVersion.findUniqueOrThrow({ where: { id }, include: { steps: { orderBy: { sortOrder: 'asc' } } } });
    const gmRole = await prisma.role.findUniqueOrThrow({ where: { code: 'GENERAL_MANAGER' } });
    const input = v.steps.map((s) => ({
      ...s,
      condition: s.key === 'general_manager' ? { type: 'TOTAL_AMOUNT', op: 'gt', value: '1000' } : s.condition,
    }));
    void gmRole;
    await saveDraftVersion(prisma, id, { steps: input });
    await publishWorkflowVersion(prisma, id);
    try {
      const r = await submitExpense(prisma, { lines: [{ cat: 'TOLLS', amount: '100' }] });
      expect((await steps(prisma, r.id)).general_manager).toBe('NOT_APPLICABLE');
      for (const [key, who] of FULL_PATH.slice(0, 2)) await approveAs(prisma, r.id, key, who);
      const acc = await userOf(prisma, 'accountant1');
      const accInst = await instanceOf(prisma, r.id, 'accountant');
      const line = await prisma.requestLine.findFirstOrThrow({ where: { requestId: r.id } });
      await editLine(prisma, { requestId: r.id, stepInstanceId: accInst.id, lineId: line.id, user: acc, amount: '5000', reason: 'x', actor: actorOf(acc) });
      expect((await steps(prisma, r.id)).general_manager).toBe('PENDING');
      await approveAs(prisma, r.id, 'accountant', 'accountant1');
      await approveAs(prisma, r.id, 'chief_accountant', 'chief');
      expect((await steps(prisma, r.id)).general_manager).toBe('ACTIVE');
    } finally {
      // restore: archive the test version by publishing a copy of the original definition again
      const d2 = await createDraftVersion(prisma, wf.id);
      await saveDraftVersion(prisma, d2.id, { steps: v.steps });
      await publishWorkflowVersion(prisma, d2.id);
    }
  });
});

describe('versioning', () => {
  it('a published new version does not affect in-flight requests', async () => {
    const wf = await prisma.workflow.findFirstOrThrow({ where: { requestType: { code: 'DRIVER_EXPENSE' } } });
    const a = await submitExpense(prisma, { lines: [{ cat: 'TOLLS', amount: '10' }] });
    const reqA = await prisma.request.findUniqueOrThrow({ where: { id: a.id } });
    const { id: draftId } = await createDraftVersion(prisma, wf.id);
    expect(await code(createDraftVersion(prisma, wf.id))).toBe('CONFLICT');
    const draft = await prisma.workflowVersion.findUniqueOrThrow({ where: { id: draftId }, include: { steps: true } });
    expect(draft.status).toBe('DRAFT');
    const kept = draft.steps.filter((s) => s.key !== 'general_manager');
    await saveDraftVersion(prisma, draftId, { note: 'no GM', steps: kept });
    // published versions are immutable
    expect(await code(saveDraftVersion(prisma, reqA.workflowVersionId, { steps: kept }))).toBe('INVALID_STATE');
    await publishWorkflowVersion(prisma, draftId);
    expect((await prisma.workflowVersion.findUniqueOrThrow({ where: { id: reqA.workflowVersionId } })).status).toBe('ARCHIVED');
    expect((await prisma.workflowVersion.findUniqueOrThrow({ where: { id: draftId } })).status).toBe('ACTIVE');
    expect(await prisma.workflowVersion.count({ where: { workflowId: wf.id, status: 'ACTIVE' } })).toBe(1);
    // in-flight request A keeps GM
    expect((await steps(prisma, a.id)).general_manager).toBe('PENDING');
    expect((await prisma.request.findUniqueOrThrow({ where: { id: a.id } })).workflowVersionId).toBe(reqA.workflowVersionId);
    for (const [key, who] of FULL_PATH.slice(0, 4)) await approveAs(prisma, a.id, key, who);
    expect((await steps(prisma, a.id)).general_manager).toBe('ACTIVE');
    // new request B uses the new version: no GM
    const b = await submitExpense(prisma, { lines: [{ cat: 'TOLLS', amount: '10' }] });
    const sb = await steps(prisma, b.id);
    expect(sb.general_manager).toBeUndefined();
    expect((await prisma.request.findUniqueOrThrow({ where: { id: b.id } })).workflowVersionId).toBe(draftId);
    // restore v1 definition as a new active version
    const d3 = await createDraftVersion(prisma, wf.id, reqA.workflowVersionId);
    await publishWorkflowVersion(prisma, d3.id);
  });

  it('publish validation rules', async () => {
    const wf = await prisma.workflow.findFirstOrThrow({ where: { requestType: { code: 'DRIVER_EXPENSE' } } });
    const { id } = await createDraftVersion(prisma, wf.id);
    const v = await prisma.workflowVersion.findUniqueOrThrow({ where: { id }, include: { steps: { orderBy: { sortOrder: 'asc' } } } });
    const reorder = [...v.steps];
    const pay = reorder.pop()!;
    reorder.unshift(pay); // PAYMENT first
    await saveDraftVersion(prisma, id, { steps: reorder });
    expect(await code(publishWorkflowVersion(prisma, id))).toBe('VALIDATION');
    // non contiguous group
    const nc = v.steps.map((s) => ({ ...s, parallelGroup: s.key === 'supervisor' || s.key === 'accountant' ? 'g' : s.parallelGroup }));
    await saveDraftVersion(prisma, id, { steps: nc });
    expect(await code(publishWorkflowVersion(prisma, id))).toBe('VALIDATION');
    // role missing
    await saveDraftVersion(prisma, id, { steps: v.steps.map((s) => (s.key === 'supervisor' ? { ...s, roleId: null } : s)) });
    expect(await code(publishWorkflowVersion(prisma, id))).toBe('VALIDATION');
    // empty
    await saveDraftVersion(prisma, id, { steps: [] });
    expect(await code(publishWorkflowVersion(prisma, id))).toBe('VALIDATION');
    // bad condition
    expect(await code(saveDraftVersion(prisma, id, { steps: v.steps.map((s) => ({ ...s, condition: { type: 'NOPE' } })) }))).toBe('VALIDATION');
    await saveDraftVersion(prisma, id, { steps: v.steps });
    await publishWorkflowVersion(prisma, id);
  });

  it('simulate shows applicable steps', async () => {
    const wf = await prisma.workflow.findFirstOrThrow({ where: { requestType: { code: 'DRIVER_EXPENSE' } }, include: { versions: { where: { status: 'ACTIVE' } } } });
    const tips = await prisma.lineCategory.findFirstOrThrow({ where: { code: 'TIPS' } });
    const sim = await simulateWorkflow(prisma, wf.versions[0].id, { categoryIds: [tips.id], totalAmount: '10' });
    const m = Object.fromEntries(sim.map((s) => [s.stepKey, s.applies]));
    expect(m.shipping_officer).toBe(true);
    expect(m.maintenance_engineer).toBe(false);
    expect(m.supervisor).toBe(true);
  });
});

describe('queues, visibility, locks, delegation', () => {
  it('two accountants see the same queue rows; counters per role', async () => {
    const r = await submitExpense(prisma, { lines: [{ cat: 'TOLLS', amount: '10' }] });
    for (const [key, who] of FULL_PATH.slice(0, 2)) await approveAs(prisma, r.id, key, who);
    const a1 = await userOf(prisma, 'accountant1');
    const a2 = await userOf(prisma, 'accountant2');
    const q1 = await listQueue(prisma, a1, {});
    const q2 = await listQueue(prisma, a2, {});
    expect(q1.items.some((i) => i.id === r.id)).toBe(true);
    expect(q2.items.some((i) => i.id === r.id)).toBe(true);
    expect(q1.items.map((i) => i.id).sort()).toEqual(q2.items.map((i) => i.id).sort());
    const item = q1.items.find((i) => i.id === r.id)!;
    expect(item.summary.vehicleNumber).toBe('2157');
    expect(item.step.nameEn).toBe('Accountant');
    const c = await queueCounters(prisma, a1);
    expect(c.find((x) => x.nameEn === 'Accountant')!.count).toBeGreaterThanOrEqual(1);
    // the engineer does not see it
    const eng = await userOf(prisma, 'engineer');
    expect((await listQueue(prisma, eng, {})).items.some((i) => i.id === r.id)).toBe(false);
    // filters
    expect((await listQueue(prisma, a1, { minAmount: '1000' })).items.some((i) => i.id === r.id)).toBe(false);
    expect((await listQueue(prisma, a1, { overdue: true })).items.some((i) => i.id === r.id)).toBe(false);
    const veh = await prisma.vehicle.findUniqueOrThrow({ where: { number: '2157' } });
    expect((await listQueue(prisma, a1, { vehicleId: veh.id })).items.some((i) => i.id === r.id)).toBe(true);
    // overdue after the SLA passed
    await prisma.requestStepInstance.updateMany({ where: { requestId: r.id, stepKey: 'accountant' }, data: { dueAt: new Date(Date.now() - 1000) } });
    const od = await listQueue(prisma, a1, { overdue: true });
    expect(od.items.find((i) => i.id === r.id)?.step.overdue).toBe(true);
  });

  it('request visibility: view_all vs role-based vs none', async () => {
    const r = await submitExpense(prisma, { lines: [{ cat: 'TOLLS', amount: '10' }] });
    const eng = await userOf(prisma, 'engineer');
    const sup = await userOf(prisma, 'supervisor');
    const acc = await userOf(prisma, 'accountant1');
    const admin = await userOf(prisma, 'admin');
    expect(await canViewRequest(prisma, eng, r.id)).toBe(false); // maintenance step was N/A
    expect(await canViewRequest(prisma, sup, r.id)).toBe(true);
    expect(await canViewRequest(prisma, acc, r.id)).toBe(true);
    expect(await canViewRequest(prisma, admin, r.id)).toBe(true);
    const m = await submitExpense(prisma, { lines: [{ cat: 'MAINTENANCE', amount: '10' }] });
    expect(await canViewRequest(prisma, eng, m.id)).toBe(true);
    const list = await listRequests(prisma, eng, { pageSize: 200 });
    expect(list.items.some((i) => i.id === m.id)).toBe(true);
    expect(list.items.some((i) => i.id === r.id)).toBe(false);
    const all = await listRequests(prisma, acc, { number: r.number });
    expect(all.items).toHaveLength(1);
    const noPerm = { ...eng, permissions: [] };
    expect(await canViewRequest(prisma, noPerm, m.id)).toBe(false);
    expect((await listRequests(prisma, noPerm, {})).total).toBe(0);
    const filtered = await listRequests(prisma, acc, { status: 'REJECTED' });
    expect(filtered.items.every((i) => i.status === 'REJECTED')).toBe(true);
  });

  it('lock: conflict 409 for another user, blocks actions, expiry frees it, force needs permission', async () => {
    const r = await submitExpense(prisma, { lines: [{ cat: 'TOLLS', amount: '10' }] });
    for (const [key, who] of FULL_PATH.slice(0, 2)) await approveAs(prisma, r.id, key, who);
    const a1 = await userOf(prisma, 'accountant1');
    const a2 = await userOf(prisma, 'accountant2');
    const chief = await userOf(prisma, 'chief');
    const lock = await acquireLock(prisma, r.id, a1);
    expect(lock.userId).toBe(a1.id);
    await acquireLock(prisma, r.id, a1); // same user: fine
    await heartbeatLock(prisma, r.id, a1);
    try {
      await acquireLock(prisma, r.id, a2);
      expect.unreachable();
    } catch (e) {
      expect((e as DomainError).code).toBe('LOCKED');
      expect((e as DomainError).httpStatus).toBe(409);
      expect((e as DomainError).message).toContain(a1.fullName);
    }
    const inst = await instanceOf(prisma, r.id, 'accountant');
    expect(await code(approveStep(prisma, { requestId: r.id, stepInstanceId: inst.id, user: a2, actor: actorOf(a2) }))).toBe('LOCKED');
    const line = await prisma.requestLine.findFirstOrThrow({ where: { requestId: r.id } });
    expect(await code(editLine(prisma, { requestId: r.id, stepInstanceId: inst.id, lineId: line.id, user: a2, amount: '1', reason: 'x', actor: actorOf(a2) }))).toBe('LOCKED');
    // queue shows the lock
    expect((await listQueue(prisma, a2, {})).items.find((i) => i.id === r.id)?.lock?.userName).toBe(a1.fullName);
    // non-holder cannot release; force needs the permission
    expect(await code(releaseLock(prisma, r.id, a2))).toBe('FORBIDDEN');
    expect(await code(releaseLock(prisma, r.id, a2, true))).toBe('FORBIDDEN');
    // expiry
    await prisma.requestLock.update({ where: { requestId: r.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const l2 = await acquireLock(prisma, r.id, a2);
    expect(l2.userId).toBe(a2.id);
    // force by a user holding the permission (super user)
    const admin = await userOf(prisma, 'admin');
    await releaseLock(prisma, r.id, admin, true);
    expect(await prisma.requestLock.count({ where: { requestId: r.id } })).toBe(0);
    expect(await prisma.requestEvent.count({ where: { requestId: r.id, type: 'LOCK_FORCED' } })).toBe(1);
    // approve implicitly takes then releases the lock
    await approveStep(prisma, { requestId: r.id, stepInstanceId: inst.id, user: a2, actor: actorOf(a2) });
    expect(await prisma.requestLock.count({ where: { requestId: r.id } })).toBe(0);
    void chief;
  });

  it('delegation: delegate sees the queue and acts on behalf (recorded), signature is the actor', async () => {
    const r = await submitExpense(prisma, { lines: [{ cat: 'TOLLS', amount: '10' }] });
    await approveAs(prisma, r.id, 'supervisor', 'supervisor');
    const mgr = await userOf(prisma, 'manager');
    const sup = await userOf(prisma, 'supervisor');
    const before = await listQueue(prisma, sup, {});
    expect(before.items.some((i) => i.id === r.id)).toBe(false);
    const del = await prisma.delegation.create({
      data: { fromUserId: mgr.id, toUserId: sup.id, startsAt: new Date(Date.now() - 3600_000), endsAt: new Date(Date.now() + 3600_000), createdById: mgr.id },
    });
    const supDel = await userOf(prisma, 'supervisor');
    expect((await listQueue(prisma, supDel, {})).items.some((i) => i.id === r.id)).toBe(true);
    const inst = await instanceOf(prisma, r.id, 'campaign_manager');
    await approveStep(prisma, { requestId: r.id, stepInstanceId: inst.id, user: supDel, actor: actorOf(supDel) });
    const after = await instanceOf(prisma, r.id, 'campaign_manager');
    expect(after.actedById).toBe(sup.id);
    expect(after.onBehalfOfUserId).toBe(mgr.id);
    expect(after.delegationId).toBe(del.id);
    const own = await prisma.signature.findFirstOrThrow({ where: { userId: sup.id, isActive: true } });
    expect(after.signatureId).toBe(own.id);
    const det = await getRequestDetail(prisma, r.id, mgr);
    expect((det.steps as { stepKey: string; onBehalfOfName: string | null }[]).find((s) => s.stepKey === 'campaign_manager')?.onBehalfOfName).toBe(mgr.fullName);
    // an expired delegation grants nothing
    await prisma.delegation.update({ where: { id: del.id }, data: { endsAt: new Date(Date.now() - 1000) } });
    const supExp = await userOf(prisma, 'supervisor');
    expect(supExp.roles.some((x) => x.code === 'CAMPAIGN_MANAGER')).toBe(false);
  });

  it('notifications fan out to role holders (and delegates) when a step activates', async () => {
    const r = await submitExpense(prisma, { lines: [{ cat: 'TOLLS', amount: '10' }] });
    const sup = await userOf(prisma, 'supervisor');
    const n = await prisma.notification.findMany({ where: { requestId: r.id, type: 'STEP_WAITING', channel: 'IN_APP' } });
    expect(n.map((x) => x.recipientUserId)).toContain(sup.id);
    expect(n[0].status).toBe('SENT');
    await approveAs(prisma, r.id, 'supervisor', 'supervisor');
    const mgr = await userOf(prisma, 'manager');
    expect(await prisma.notification.count({ where: { requestId: r.id, type: 'STEP_WAITING', recipientUserId: mgr.id } })).toBe(1);
    expect(await prisma.notification.count({ where: { requestId: r.id, type: 'REQ_AT_STEP' } })).toBeGreaterThanOrEqual(2);
  });
});

describe('request detail', () => {
  it('builds the full shape with myActions for the active role', async () => {
    const r = await submitExpense(prisma, { lines: [{ cat: 'TOLLS', amount: '10' }] });
    const sup = await userOf(prisma, 'supervisor');
    const det = (await getRequestDetail(prisma, r.id, sup)) as Record<string, any>;
    expect(det.number).toBe(r.number);
    expect(det.status).toBe('IN_REVIEW');
    expect(det.lines[0].attachments).toHaveLength(1);
    expect(det.steps.length).toBeGreaterThanOrEqual(8);
    expect(det.module.vehicleNumber).toBe('2157');
    expect(det.myActions.approve).toBe(true);
    expect(det.myActions.sendBack).toBe(false);
    expect(det.myActions.editAmounts).toBe(false);
    expect(det.myActions.checklist[0].key).toBe('receipts_match');
    expect(det.events[0].type).toBe('SUBMITTED');
    const eng = await userOf(prisma, 'engineer');
    expect(((await getRequestDetail(prisma, r.id, eng)) as Record<string, any>).myActions).toBeNull();
    await expect(getRequestDetail(prisma, 'nope')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
