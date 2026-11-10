// Test fixtures (WP4): builds a request in the cloned seed DB with Prisma only, no engine needed.
import sharp from 'sharp';
import { divDecimal } from '@dms/shared';
import type { PrismaClient } from '@prisma/client';
import type { StorageAdapter } from '../storage';
import { buildJournalEntry } from '../sap';

export type Scenario = 'neither' | 'maintenance' | 'tips' | 'both';

export interface FixtureOptions {
  scenario?: Scenario;
  status?: 'PAID' | 'IN_REVIEW';
  /** number of approvals recorded when status is IN_REVIEW (steps in workflow order) */
  approvedUpTo?: number;
  number?: string;
  /** accountant lowered the maintenance/fuel amount */
  edited?: boolean;
  storage?: StorageAdapter;
  withSapPosting?: boolean;
  treasuryCashGl?: string;
  paidAt?: Date;
  /** delegate the first approval: onBehalfOfUsername */
  delegatedBy?: string;
}

const ROLE_USER: Record<string, string> = {
  CAMPAIGN_SUPERVISOR: 'supervisor',
  CAMPAIGN_MANAGER: 'manager',
  MAINTENANCE_ENGINEER: 'engineer',
  SHIPPING_OFFICER: 'shipping',
  ACCOUNTANT: 'accountant1',
  CHIEF_ACCOUNTANT: 'chief',
  GENERAL_MANAGER: 'gm',
  TREASURY: 'treasury',
};

let seq = 0;

export async function createRequestFixture(prisma: PrismaClient, o: FixtureOptions = {}) {
  const scenario = o.scenario ?? 'neither';
  const status = o.status ?? 'PAID';
  seq++;
  const number = o.number ?? `DE-26-9${String(seq).padStart(5, '0')}`;

  const rt = await prisma.requestType.findUniqueOrThrow({ where: { code: 'DRIVER_EXPENSE' } });
  const wfv = await prisma.workflowVersion.findFirstOrThrow({
    where: { workflow: { requestTypeId: rt.id }, status: 'ACTIVE' },
    include: { steps: { include: { role: true }, orderBy: { sortOrder: 'asc' } } },
  });
  const tv = await prisma.templateVersion.findFirstOrThrow({ where: { template: { requestTypeId: rt.id }, status: 'ACTIVE' } });
  const submitter = await prisma.submitter.findUniqueOrThrow({ where: { code: 'DRV001' } });
  const vehicle = await prisma.vehicle.findUniqueOrThrow({
    where: { number: '2157' },
    include: { vehicleType: true, costCenter: true },
  });
  const cats = await prisma.lineCategory.findMany({
    where: { requestTypeId: rt.id },
    include: { expenseConfig: { include: { glAccount: true } } },
  });
  const cat = (code: string) => cats.find((c) => c.code === code)!;

  const lineDefs: { code: string; original: string; amount: string; qty?: string }[] = [
    { code: 'TOLLS', original: '100.00', amount: '100.00' },
    { code: 'DIESEL', original: '800.00', amount: o.edited ? '750.50' : '800.00', qty: '100' },
  ];
  if (scenario === 'maintenance' || scenario === 'both') lineDefs.push({ code: 'MAINTENANCE', original: '600.00', amount: '600.00' });
  if (scenario === 'tips' || scenario === 'both') lineDefs.push({ code: 'TIPS', original: '50.00', amount: '50.00' });
  const sum = (k: 'original' | 'amount') => lineDefs.reduce((a, l) => a + Number(l[k]), 0).toFixed(2);

  const req = await prisma.request.create({
    data: {
      number,
      requestTypeId: rt.id,
      departmentId: submitter.departmentId,
      workflowVersionId: wfv.id,
      templateVersionId: tv.id,
      status,
      channel: 'TELEGRAM',
      submitterId: submitter.id,
      headerValues: {},
      totalOriginal: sum('original'),
      totalFinal: sum('amount'),
      lineCount: lineDefs.length,
      paidAt: status === 'PAID' ? (o.paidAt ?? new Date('2026-03-10T10:00:00Z')) : null,
    },
  });

  const sigOf = async (userId?: string, submitterId?: string) =>
    prisma.signature.findFirst({ where: userId ? { userId, isActive: true } : { submitterId, isActive: true } });
  const putSig = async (key: string) => {
    if (!o.storage) return;
    const png = await sharp({ create: { width: 200, height: 80, channels: 4, background: { r: 20, g: 30, b: 120, alpha: 1 } } }).png().toBuffer();
    await o.storage.put(key, png, { contentType: 'image/png' });
  };

  const subSig = await sigOf(undefined, submitter.id);
  if (subSig) {
    await prisma.request.update({ where: { id: req.id }, data: { submitterSignatureId: subSig.id } });
    await putSig(subSig.storageKey);
  }

  await prisma.expenseRequest.create({
    data: {
      requestId: req.id,
      vehicleId: vehicle.id,
      vehicleNumber: vehicle.number,
      plateNumber: vehicle.plateNumber,
      vehicleTypeId: vehicle.vehicleTypeId,
      vehicleTypeName: vehicle.vehicleType.nameAr,
      costCenterId: vehicle.costCenterId,
      costCenterCode: vehicle.costCenter.code,
      odometer: 154200,
    },
  });

  let lineNo = 0;
  for (const d of lineDefs) {
    lineNo++;
    const c = cat(d.code);
    const gl = c.expenseConfig!.glAccount;
    const line = await prisma.requestLine.create({
      data: {
        requestId: req.id,
        lineNo,
        categoryId: c.id,
        originalCategoryId: c.id,
        categoryNameAr: c.nameAr,
        categoryNameEn: c.nameEn,
        originalAmount: d.original,
        amount: d.amount,
        isEdited: d.original !== d.amount,
        extraValues: d.qty ? { liters: d.qty } : {},
        quantity: d.qty ?? null,
        unitPrice: d.qty ? divDecimal(d.amount, d.qty) : null,
        lineDate: new Date('2026-03-09'),
      },
    });
    await prisma.expenseLine.create({
      data: {
        lineId: line.id,
        requestId: req.id,
        glAccountId: gl.id,
        glNumber: gl.number,
        glName: gl.nameAr,
        costCenterId: vehicle.costCenterId,
        costCenterCode: vehicle.costCenter.code,
        vehicleId: vehicle.id,
        vehicleNumber: vehicle.number,
      },
    });
  }

  // step instances
  const applicable = (key: string): boolean => {
    if (key === 'maintenance_engineer') return scenario === 'maintenance' || scenario === 'both';
    if (key === 'shipping_officer') return scenario === 'tips' || scenario === 'both';
    return true;
  };
  let stage = 0;
  let n = 0;
  const approvedMax = status === 'PAID' ? Infinity : (o.approvedUpTo ?? 1);
  let first = true;
  let activeSet = false;
  for (const s of wfv.steps) {
    if (!s.role) continue; // dynamic slot: no role in these scenarios
    n++;
    stage++;
    const ok = applicable(s.key);
    const approved = ok && n <= approvedMax;
    const username = ROLE_USER[s.role.code]!;
    const user = await prisma.user.findUniqueOrThrow({ where: { username } });
    let onBehalf: string | undefined;
    if (approved && first && o.delegatedBy) {
      onBehalf = (await prisma.user.findUniqueOrThrow({ where: { username: o.delegatedBy } })).id;
    }
    const sig = approved ? await sigOf(user.id) : null;
    if (sig) await putSig(sig.storageKey);
    await prisma.requestStepInstance.create({
      data: {
        requestId: req.id,
        workflowStepId: s.id,
        stepKey: s.key,
        stageIndex: stage,
        sortOrder: s.sortOrder,
        kind: s.kind,
        nameAr: s.nameAr,
        nameEn: s.nameEn,
        roleId: s.roleId!,
        roleNameAr: s.role.nameAr,
        roleNameEn: s.role.nameEn,
        status: !ok ? 'NOT_APPLICABLE' : approved ? 'APPROVED' : !activeSet ? 'ACTIVE' : 'PENDING',
        activatedAt: new Date('2026-03-09T08:00:00Z'),
        dueAt: new Date('2026-03-10T08:00:00Z'),
        actedAt: approved ? new Date(`2026-03-09T${String(8 + n).padStart(2, '0')}:15:00Z`) : null,
        actedById: approved ? user.id : null,
        onBehalfOfUserId: onBehalf ?? null,
        signatureId: sig?.id ?? null,
      },
    });
    if (approved) first = false;
    else if (ok) activeSet = true;
  }

  const treasury = await prisma.treasury.findFirstOrThrow({ where: { isDefault: true } });
  if (o.treasuryCashGl) await prisma.treasury.update({ where: { id: treasury.id }, data: { cashGlNumber: o.treasuryCashGl } });
  if (status === 'PAID') await prisma.expenseRequest.update({ where: { requestId: req.id }, data: { treasuryId: treasury.id } });

  let postingId: string | undefined;
  if (o.withSapPosting && status === 'PAID') {
    const payload = await buildJournalEntry(prisma, req.id);
    const p = await prisma.sapPosting.create({
      data: { requestId: req.id, idempotencyKey: req.id, adapter: 'mock', payload: payload as never },
    });
    postingId = p.id;
  }
  return { requestId: req.id, number, postingId };
}
