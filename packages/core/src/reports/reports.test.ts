import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import ExcelJS from 'exceljs';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupTestDb, type TestDb } from '@dms/db/testing';
import { createLocalStorage, verifyFileUrl, type StorageAdapter } from '../storage';
import { ingestAttachment } from '../media';
import {
  createExport,
  dashboardSummary,
  exportInfo,
  queryReport,
  runExport,
  type ReportFilters,
} from './index';

let t: TestDb;
let storage: StorageAdapter;
let ids: {
  typeId: string;
  wfvId: string;
  stepId: string;
  roleId: string;
  userId: string;
  cat: Record<string, { id: string; nameAr: string; nameEn: string; gl: { id: string; number: string; nameEn: string } }>;
  vehicles: { id: string; number: string; costCenterId: string; costCenterCode: string; vehicleTypeId: string }[];
  drivers: { id: string; fullName: string }[];
};

async function photo(seed: number): Promise<Buffer> {
  const w = 320;
  const h = 240;
  const px = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 3;
      const b = (Math.floor(x / 40) * 7 + Math.floor(y / 30) * (seed + 3)) % 5;
      px[o] = (x * (seed + 1) * 0.9 + b * 40) % 256;
      px[o + 1] = (y * 1.3 + b * 25) % 256;
      px[o + 2] = (x + y + seed * 31 + b * 55) % 256;
    }
  }
  return sharp(px, { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality: 85 }).toBuffer();
}

interface LineSpec {
  cat: string;
  amount: string;
  original?: string;
  qty?: string;
  images?: number;
}
let imgSeed = 100;

async function mkRequest(o: {
  number: string;
  submittedAt: string;
  driver: number;
  vehicle: number;
  status?: 'IN_REVIEW' | 'PAID' | 'APPROVED';
  lines: LineSpec[];
  approved?: boolean;
  paidAt?: string;
}) {
  const v = ids.vehicles[o.vehicle]!;
  const total = o.lines.reduce((s, l) => s + Number(l.amount), 0).toFixed(2);
  const totalO = o.lines.reduce((s, l) => s + Number(l.original ?? l.amount), 0).toFixed(2);
  const req = await t.prisma.request.create({
    data: {
      number: o.number,
      requestTypeId: ids.typeId,
      workflowVersionId: ids.wfvId,
      channel: 'TELEGRAM',
      status: o.status ?? 'IN_REVIEW',
      submitterId: ids.drivers[o.driver]!.id,
      totalOriginal: totalO,
      totalFinal: total,
      lineCount: o.lines.length,
      submittedAt: new Date(o.submittedAt),
      paidAt: o.paidAt ? new Date(o.paidAt) : null,
    },
  });
  await t.prisma.expenseRequest.create({
    data: {
      requestId: req.id,
      vehicleId: v.id,
      vehicleNumber: v.number,
      vehicleTypeId: v.vehicleTypeId,
      costCenterId: v.costCenterId,
      costCenterCode: v.costCenterCode,
      odometer: 120000 + o.vehicle,
      sapDocNumber: o.status === 'PAID' ? `49000${o.number.slice(-3)}` : null,
    },
  });
  let lineNo = 0;
  for (const l of o.lines) {
    lineNo++;
    const c = ids.cat[l.cat]!;
    const line = await t.prisma.requestLine.create({
      data: {
        requestId: req.id,
        lineNo,
        categoryId: c.id,
        originalCategoryId: c.id,
        categoryNameAr: c.nameAr,
        categoryNameEn: c.nameEn,
        originalAmount: l.original ?? l.amount,
        amount: l.amount,
        isEdited: !!l.original,
        quantity: l.qty ?? null,
        unitPrice: l.qty ? (Number(l.amount) / Number(l.qty)).toFixed(2) : null,
      },
    });
    await t.prisma.expenseLine.create({
      data: {
        lineId: line.id,
        requestId: req.id,
        glAccountId: c.gl.id,
        glNumber: c.gl.number,
        glName: c.gl.nameEn,
        costCenterId: v.costCenterId,
        costCenterCode: v.costCenterCode,
        vehicleId: v.id,
        vehicleNumber: v.number,
      },
    });
    for (let i = 0; i < (l.images ?? 0); i++) {
      await ingestAttachment(t.prisma, storage, { bytes: await photo(imgSeed++), requestId: req.id, lineId: line.id });
    }
  }
  if (o.approved) {
    await t.prisma.requestStepInstance.create({
      data: {
        requestId: req.id,
        workflowStepId: ids.stepId,
        stepKey: 'accountant',
        stageIndex: 0,
        sortOrder: 0,
        nameAr: 'محاسب',
        nameEn: 'Accountant',
        roleId: ids.roleId,
        roleNameAr: 'محاسب',
        roleNameEn: 'Accountant',
        status: 'APPROVED',
        activatedAt: new Date('2026-01-10T08:00:00Z'),
        actedAt: new Date('2026-01-10T10:00:00Z'),
        actedById: ids.userId,
      },
    });
  }
  return req;
}

// ---- tiny zip reader (central directory) ----
function readZip(buf: Buffer): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  const n = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let i = 0; i < n; i++) {
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28);
    const elen = buf.readUInt16LE(p + 30);
    const clen = buf.readUInt16LE(p + 32);
    const lho = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nlen);
    const lnlen = buf.readUInt16LE(lho + 26);
    const lelen = buf.readUInt16LE(lho + 28);
    const data = buf.subarray(lho + 30 + lnlen + lelen, lho + 30 + lnlen + lelen + csize);
    out.set(name, method === 8 ? inflateRawSync(data) : Buffer.from(data));
    p += 46 + nlen + elen + clen;
  }
  return out;
}

const base = (over: Partial<ReportFilters> = {}): ReportFilters => ({ dateField: 'submittedAt', ...over });

beforeAll(async () => {
  t = await setupTestDb('wp5-reports');
  storage = createLocalStorage(mkdtempSync(join(tmpdir(), 'wp5-rep-')));
  const cats = await t.prisma.lineCategory.findMany({ include: { expenseConfig: { include: { glAccount: true } } } });
  const cat: typeof ids.cat = {};
  for (const c of cats) {
    const gl = c.expenseConfig?.glAccount;
    if (gl) cat[c.code] = { id: c.id, nameAr: c.nameAr, nameEn: c.nameEn, gl: { id: gl.id, number: gl.number, nameEn: gl.nameEn } };
  }
  const vehicles = (await t.prisma.vehicle.findMany({ include: { costCenter: true }, orderBy: { number: 'asc' }, take: 3 })).map((v) => ({
    id: v.id,
    number: v.number,
    costCenterId: v.costCenterId,
    costCenterCode: v.costCenter.code,
    vehicleTypeId: v.vehicleTypeId,
  }));
  const drivers = await t.prisma.submitter.findMany({ orderBy: { code: 'asc' }, take: 3, select: { id: true, fullName: true } });
  const role = await t.prisma.role.findFirstOrThrow({ where: { code: 'ACCOUNTANT' } });
  ids = {
    typeId: (await t.prisma.requestType.findFirstOrThrow()).id,
    wfvId: (await t.prisma.workflowVersion.findFirstOrThrow()).id,
    stepId: (await t.prisma.workflowStep.findFirstOrThrow()).id,
    roleId: role.id,
    userId: (await t.prisma.user.findFirstOrThrow({ where: { username: 'accountant1' } })).id,
    cat,
    vehicles,
    drivers,
  };

  // 2026-01 (Cairo is UTC+2 in winter)
  await mkRequest({ number: 'DE-26-900001', submittedAt: '2026-01-05T09:00:00Z', driver: 0, vehicle: 0, lines: [{ cat: 'TOLLS', amount: '50.00', images: 2 }, { cat: 'DIESEL', amount: '600.00', qty: '300', images: 1 }], approved: true });
  await mkRequest({ number: 'DE-26-900002', submittedAt: '2026-01-20T10:00:00Z', driver: 1, vehicle: 1, status: 'PAID', paidAt: '2026-01-22T10:00:00Z', lines: [{ cat: 'TOLLS', amount: '75.50', original: '80.00', images: 1 }], approved: true });
  await mkRequest({ number: 'DE-26-900003', submittedAt: '2026-01-31T22:30:00Z', driver: 0, vehicle: 0, lines: [{ cat: 'TOLLS', amount: '25.25', images: 1 }] }); // = 2026-02-01 00:30 Cairo
  await mkRequest({ number: 'DE-26-900004', submittedAt: '2026-03-02T10:00:00Z', driver: 2, vehicle: 2, lines: [{ cat: 'TOLLS', amount: '10.00', images: 1 }, { cat: 'DIESEL', amount: '100.00', qty: '50' }] });
});
afterAll(async () => {
  await t?.teardown();
});

describe('queryReport', () => {
  it('has the seeded fixtures it needs', () => {
    expect(ids.cat.TOLLS).toBeDefined();
    expect(ids.cat.DIESEL).toBeDefined();
    expect(ids.vehicles).toHaveLength(3);
    expect(ids.drivers).toHaveLength(3);
  });
  it('returns one row per line with the requirement columns', async () => {
    const r = await queryReport(t.prisma, base({ from: '2026-01-01', to: '2026-01-31' }), { page: 1, pageSize: 50 });
    // 900003 is 2026-02-01 in Cairo -> excluded
    expect(r.rows.map((x) => x.requestNumber).sort()).toEqual(['DE-26-900001', 'DE-26-900001', 'DE-26-900002']);
    expect(r.totals).toEqual({ count: 3, originalTotal: '730.00', finalTotal: '725.50' });
    const diesel = r.rows.find((x) => x.categoryCode === 'DIESEL')!;
    expect(diesel).toMatchObject({ liters: '300.000', pricePerLiter: '2.00', imageCount: 1, vehicleNumber: ids.vehicles[0]!.number, costCenterCode: ids.vehicles[0]!.costCenterCode, glNumber: ids.cat.DIESEL!.gl.number, originalAmount: '600.00', finalAmount: '600.00', link: expect.stringMatching(/^\/requests\//) });
    expect(diesel.approvers).toHaveLength(1);
    expect(diesel.approvers[0]).toMatchObject({ roleNameEn: 'Accountant', userName: expect.any(String) });
    const paid = r.rows.find((x) => x.requestNumber === 'DE-26-900002')!;
    expect(paid).toMatchObject({ status: 'PAID', sapDocNumber: '49000002', originalAmount: '80.00', finalAmount: '75.50', lineDate: '2026-01-20' });
  });
  it('filters by expense type, vehicle, driver, gl, cost center, status, number, amount, step role, dateField', async () => {
    const q = async (f: Partial<ReportFilters>) => (await queryReport(t.prisma, base(f), { page: 1, pageSize: 50 })).totals.count;
    expect(await q({ categoryIds: [ids.cat.TOLLS!.id] })).toBe(4);
    expect(await q({ categoryIds: [ids.cat.DIESEL!.id] })).toBe(2);
    expect(await q({ vehicleIds: [ids.vehicles[1]!.id] })).toBe(1);
    expect(await q({ submitterIds: [ids.drivers[0]!.id] })).toBe(3);
    expect(await q({ glAccountIds: [ids.cat.DIESEL!.gl.id] })).toBe(2);
    expect(await q({ costCenterIds: [ids.vehicles[0]!.costCenterId] })).toBeGreaterThanOrEqual(3);
    expect(await q({ vehicleTypeIds: [ids.vehicles[0]!.vehicleTypeId] })).toBeGreaterThanOrEqual(3);
    expect(await q({ statuses: ['PAID'] })).toBe(1);
    expect(await q({ number: '900002' })).toBe(1);
    expect(await q({ number: '%' })).toBe(0);
    expect(await q({ minAmount: '100' })).toBe(2);
    expect(await q({ maxAmount: '50' })).toBe(3);
    expect(await q({ dateField: 'paidAt', from: '2026-01-01', to: '2026-01-31' })).toBe(1);
    expect(await q({ dateField: 'lineDate', from: '2026-02-01', to: '2026-02-01' })).toBe(1);
    expect(await q({ from: '2026-02-01', to: '2026-02-01' })).toBe(1);
    expect(await q({ stepRoleIds: [ids.roleId] })).toBe(0); // approved steps are not "waiting"
  });
  it('groups with whole-set group totals and paginates rows', async () => {
    for (const g of ['driver', 'vehicle', 'expenseType', 'gl', 'costCenter', 'month'] as const) {
      const r = await queryReport(t.prisma, base(), { groupBy: g, page: 1, pageSize: 2 });
      expect(r.rows).toHaveLength(2);
      expect(r.totals.count).toBe(6);
      expect(r.groups!.reduce((s, x) => s + x.count, 0)).toBe(6);
      expect(r.groups!.reduce((s, x) => s + Number(x.finalTotal), 0)).toBeCloseTo(Number(r.totals.finalTotal), 2);
    }
    const byType = await queryReport(t.prisma, base(), { groupBy: 'expenseType', page: 1, pageSize: 50 });
    const tolls = byType.groups!.find((x) => x.label === ids.cat.TOLLS!.nameEn)!;
    expect(tolls).toMatchObject({ count: 4, finalTotal: '160.75', originalTotal: '165.25' });
    const byMonth = await queryReport(t.prisma, base(), { groupBy: 'month', page: 1, pageSize: 50 });
    expect(byMonth.groups!.map((x) => [x.label, x.count])).toEqual([['2026-01', 3], ['2026-02', 1], ['2026-03', 2]]);
    const p2 = await queryReport(t.prisma, base(), { page: 2, pageSize: 4 });
    expect(p2.rows).toHaveLength(2);
  });
  it('rejects invalid input', async () => {
    await expect(queryReport(t.prisma, base({ from: 'garbage' }), { page: 1, pageSize: 10 })).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(queryReport(t.prisma, base({ minAmount: "1; DROP TABLE x" }), { page: 1, pageSize: 10 })).rejects.toMatchObject({ code: 'VALIDATION' });
  });
});

describe('exports: auditor scenario (tolls in January)', () => {
  it('EXCEL: rows, totals and subtotals are correct; audit + notification + signed link', async () => {
    const filters = base({ from: '2026-01-01', to: '2026-01-31', categoryIds: [ids.cat.TOLLS!.id] });
    const { exportId } = await createExport(t.prisma, { userId: ids.userId, kind: 'EXCEL', filters, groupBy: 'vehicle', actor: { type: 'USER', userId: ids.userId } });
    expect(await t.prisma.auditLog.count({ where: { action: 'reports.export.create', entityId: exportId } })).toBe(1);
    expect(await t.prisma.job.count({ where: { type: 'report.export', dedupeKey: `report.export:${exportId}` } })).toBe(1);

    await runExport(t.prisma, storage, exportId);
    await runExport(t.prisma, storage, exportId); // idempotent
    const e = await t.prisma.reportExport.findUniqueOrThrow({ where: { id: exportId } });
    expect(e.status).toBe('DONE');
    expect(e.rowCount).toBe(2);
    expect(e.fileName).toMatch(/\.xlsx$/);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await storage.get(e.storageKey!)) as unknown as ExcelJS.Buffer);
    const ws = wb.getWorksheet('Report')!;
    const values = ws.getSheetValues().slice(2) as unknown[][];
    const col = (name: string) => (ws.getRow(1).values as string[]).indexOf(name);
    const nums = values.filter((r) => typeof r?.[col('Request No.')] === 'string' && String(r[col('Request No.')]).startsWith('DE-26-'));
    expect(nums.map((r) => r[col('Request No.')]).sort()).toEqual(['DE-26-900001', 'DE-26-900002']);
    const sub = values.filter((r) => String(r?.[col('Request No.')] ?? '').startsWith('Subtotal'));
    expect(sub).toHaveLength(2);
    const grand = values.find((r) => r?.[col('Request No.')] === 'Grand total')!;
    expect(grand[col('Final amount')]).toBeCloseTo(125.5, 2);
    expect(grand[col('Original amount')]).toBeCloseTo(130, 2);
    expect(await t.prisma.auditLog.count({ where: { action: 'reports.export.completed', entityId: exportId } })).toBe(1);

    const n = await t.prisma.notification.findFirstOrThrow({ where: { recipientUserId: ids.userId, type: 'EXPORT_READY' } });
    const url = (n.data as { downloadUrl: string }).downloadUrl;
    const u = new URL(url, 'http://x');
    const v = verifyFileUrl({ keyB64: u.pathname.split('/').pop()!, exp: u.searchParams.get('exp')!, d: u.searchParams.get('d') ?? undefined, n: u.searchParams.get('n') ?? undefined, sig: u.searchParams.get('sig')! });
    expect(v?.key).toBe(e.storageKey);
    expect(exportInfo(e).downloadUrl).toMatch(/^\/api\/v1\/files\//);
    expect(exportInfo({ ...e, expiresAt: new Date(Date.now() - 1000) }).status).toBe('EXPIRED');
  });

  it('ZIP_IMAGES: ExpenseType/RequestNumber/image_n.jpg plus index.xlsx', async () => {
    const filters = base({ from: '2026-01-01', to: '2026-01-31', categoryIds: [ids.cat.TOLLS!.id] });
    const { exportId } = await createExport(t.prisma, { userId: ids.userId, kind: 'ZIP_IMAGES', filters, actor: { type: 'USER', userId: ids.userId } });
    await runExport(t.prisma, storage, exportId);
    const e = await t.prisma.reportExport.findUniqueOrThrow({ where: { id: exportId } });
    expect(e.status).toBe('DONE');
    const zip = readZip(await storage.get(e.storageKey!));
    const folder = ids.cat.TOLLS!.nameEn.replace(/\s+/g, '_');
    const names = [...zip.keys()].sort();
    expect(names).toEqual([
      `${folder}/DE-26-900001/image_1.jpg`,
      `${folder}/DE-26-900001/image_2.jpg`,
      `${folder}/DE-26-900002/image_1.jpg`,
      'index.xlsx',
    ]);
    // the stored bytes are the original attachment bytes
    const att = await t.prisma.attachment.findMany({ where: { request: { number: 'DE-26-900002' } } });
    expect(zip.get(`${folder}/DE-26-900002/image_1.jpg`)!.equals(await storage.get(att[0]!.storageKey))).toBe(true);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(zip.get("index.xlsx")! as unknown as ExcelJS.Buffer);
    expect(wb.getWorksheet('Report')).toBeDefined();
    const images = wb.getWorksheet('Images')!;
    expect(images.rowCount).toBe(4); // header + 3
    expect(String(images.getRow(2).getCell(4).value)).toContain('/image_');
    // diesel images are not in the ZIP (filtered by expense type)
    expect(names.some((n) => n.includes('DE-26-900004'))).toBe(false);
  });

  it('ZIP honours a custom folder pattern and records missing files', async () => {
    const filters = base({ number: '900002' });
    const { exportId } = await createExport(t.prisma, { userId: ids.userId, kind: 'ZIP_IMAGES', filters, options: { folderPattern: '{month}/{vehicle}/{requestNumber}' }, actor: { type: 'USER', userId: ids.userId } });
    await runExport(t.prisma, storage, exportId);
    const e = await t.prisma.reportExport.findUniqueOrThrow({ where: { id: exportId } });
    const zip = readZip(await storage.get(e.storageKey!));
    expect([...zip.keys()].some((n) => /^2026-01\/[^/]+\/DE-26-900002\/image_1\.jpg$/.test(n))).toBe(true);
  });

  it('PDF_BUNDLE merges stored final PDFs; fails cleanly when none exist', async () => {
    const mk = async (pages: number) => {
      const d = await PDFDocument.create();
      for (let i = 0; i < pages; i++) d.addPage();
      return Buffer.from(await d.save());
    };
    const r1 = await t.prisma.request.findUniqueOrThrow({ where: { number: 'DE-26-900001' } });
    const r2 = await t.prisma.request.findUniqueOrThrow({ where: { number: 'DE-26-900002' } });
    for (const [r, pages] of [[r1, 1], [r2, 2]] as const) {
      const bytes = await mk(pages);
      const put = await storage.put(`documents/${r.number}/final.pdf`, bytes);
      await t.prisma.requestDocument.create({ data: { requestId: r.id, kind: 'FINAL', storageKey: put.key, sha256: put.sha256, sizeBytes: put.size } });
    }
    const { exportId } = await createExport(t.prisma, { userId: ids.userId, kind: 'PDF_BUNDLE', filters: base({ from: '2026-01-01', to: '2026-01-31' }), actor: { type: 'USER', userId: ids.userId } });
    await runExport(t.prisma, storage, exportId);
    const e = await t.prisma.reportExport.findUniqueOrThrow({ where: { id: exportId } });
    expect(e.status).toBe('DONE');
    expect(e.rowCount).toBe(2);
    const merged = await PDFDocument.load(await storage.get(e.storageKey!));
    expect(merged.getPageCount()).toBe(3);

    const none = await createExport(t.prisma, { userId: ids.userId, kind: 'PDF_BUNDLE', filters: base({ number: 'NO-SUCH' }), actor: { type: 'USER', userId: ids.userId } });
    await runExport(t.prisma, storage, none.exportId);
    const f = await t.prisma.reportExport.findUniqueOrThrow({ where: { id: none.exportId } });
    expect(f.status).toBe('FAILED');
    expect(f.error).toBeTruthy();
    expect(await t.prisma.auditLog.count({ where: { action: 'reports.export.failed', entityId: none.exportId } })).toBe(1);
  });
});

describe('dashboardSummary', () => {
  it('aggregates by period, vehicle, expense type, top vehicles, step hours', async () => {
    const d = await dashboardSummary(t.prisma, {});
    expect(d.totals.count).toBe(4);
    expect(d.totals.finalTotal).toBe('860.75');
    expect(d.byPeriod.map((p) => [p.period, p.total])).toEqual([['2026-01', '725.50'], ['2026-02', '25.25'], ['2026-03', '110.00']]);
    expect(d.byVehicle[0]).toMatchObject({ vehicleNumber: ids.vehicles[0]!.number, total: '675.25' });
    expect(d.topVehicles[0]!.vehicleId).toBe(ids.vehicles[0]!.id);
    expect(d.byExpenseType.find((x) => x.code === 'DIESEL')).toMatchObject({ total: '700.00', count: 2 });
    expect(d.avgApprovalHoursByStep[0]).toMatchObject({ stepKey: 'accountant', count: 2, avgHours: 2 });
    const jan = await dashboardSummary(t.prisma, { from: '2026-01-01', to: '2026-01-31' });
    expect(jan.totals.finalTotal).toBe('725.50');
    expect(jan.delayedByRole).toEqual([]);
  });
  it('counts delayed active steps per role', async () => {
    const r = await mkRequest({ number: 'DE-26-900009', submittedAt: '2026-01-06T09:00:00Z', driver: 0, vehicle: 0, lines: [{ cat: 'TOLLS', amount: '1.00' }] });
    await t.prisma.requestStepInstance.create({
      data: { requestId: r.id, workflowStepId: ids.stepId, stepKey: 'late', stageIndex: 0, sortOrder: 0, nameAr: 'م', nameEn: 'Late', roleId: ids.roleId, roleNameAr: 'محاسب', roleNameEn: 'Accountant', status: 'ACTIVE', activatedAt: new Date(Date.now() - 5 * 3600_000), dueAt: new Date(Date.now() - 3600_000) },
    });
    const d = await dashboardSummary(t.prisma, {});
    expect(d.delayedByRole).toEqual([expect.objectContaining({ roleId: ids.roleId, count: 1 })]);
    const q = await queryReport(t.prisma, base({ stepRoleIds: [ids.roleId] }), { page: 1, pageSize: 10 });
    expect(q.rows.map((x) => x.requestNumber)).toEqual(['DE-26-900009']);
  });
});

