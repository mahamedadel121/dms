import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resetConfigCache } from '@dms/core/config';
import { ingestAttachment } from '@dms/core/media';
import { runExport } from '@dms/core/reports';
import { getStorage } from '@dms/core/storage';
import { createTestApp, type TestApp } from '../helpers';

let t: TestApp;
let tollsId: string;
let H: Record<string, { Authorization: string }>;

beforeAll(async () => {
  process.env.STORAGE_ROOT = mkdtempSync(join(tmpdir(), 'wp5-api-rep-'));
  resetConfigCache();
  t = await createTestApp('wp5-reports');
  H = {};
  for (const u of ['admin', 'accountant1', 'gm', 'manager', 'engineer', 'treasury']) H[u] = await t.auth(u);

  const cat = await t.prisma.lineCategory.findFirstOrThrow({
    where: { code: 'TOLLS' },
    include: { expenseConfig: { include: { glAccount: true } } },
  });
  tollsId = cat.id;
  const veh = await t.prisma.vehicle.findFirstOrThrow({ include: { costCenter: true } });
  const drv = await t.prisma.submitter.findFirstOrThrow();
  const req = await t.prisma.request.create({
    data: {
      number: 'DE-26-910001',
      requestTypeId: cat.requestTypeId,
      workflowVersionId: (await t.prisma.workflowVersion.findFirstOrThrow()).id,
      channel: 'TELEGRAM',
      submitterId: drv.id,
      totalOriginal: '42.00',
      totalFinal: '42.00',
      lineCount: 1,
      submittedAt: new Date('2026-01-10T10:00:00Z'),
    },
  });
  await t.prisma.expenseRequest.create({
    data: { requestId: req.id, vehicleId: veh.id, vehicleNumber: veh.number, costCenterId: veh.costCenterId, costCenterCode: veh.costCenter.code, odometer: 1000 },
  });
  const line = await t.prisma.requestLine.create({
    data: { requestId: req.id, lineNo: 1, categoryId: cat.id, originalCategoryId: cat.id, categoryNameAr: cat.nameAr, categoryNameEn: cat.nameEn, originalAmount: '42.00', amount: '42.00' },
  });
  const gl = cat.expenseConfig!.glAccount;
  await t.prisma.expenseLine.create({
    data: { lineId: line.id, requestId: req.id, glAccountId: gl.id, glNumber: gl.number, glName: gl.nameEn, costCenterId: veh.costCenterId, costCenterCode: veh.costCenter.code, vehicleId: veh.id, vehicleNumber: veh.number },
  });
  const img = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  await ingestAttachment(t.prisma, getStorage(), { bytes: img, requestId: req.id, lineId: line.id });
});
afterAll(async () => {
  await t?.close();
});

const filters = () => ({ dateField: 'submittedAt', from: '2026-01-01', to: '2026-01-31', categoryIds: [tollsId] });

describe('permissions', () => {
  it('401 without a token', async () => {
    expect((await t.http.post('/api/v1/reports/query').send({ filters: filters() })).status).toBe(401);
    expect((await t.http.get('/api/v1/dashboard/summary')).status).toBe(401);
  });
  it('report query needs reports.view', async () => {
    expect((await t.http.post('/api/v1/reports/query').set(H.engineer!).send({ filters: filters() })).status).toBe(403);
    expect((await t.http.post('/api/v1/reports/query').set(H.manager!).send({ filters: filters() })).status).toBe(200);
    expect((await t.http.post('/api/v1/reports/query').set(H.treasury!).send({ filters: filters() })).status).toBe(200);
  });
  it('exports need reports.export; ZIP_IMAGES also reports.export_images', async () => {
    const body = (kind: string) => ({ kind, filters: filters() });
    expect((await t.http.post('/api/v1/reports/exports').set(H.manager!).send(body('EXCEL'))).status).toBe(403);
    expect((await t.http.post('/api/v1/reports/exports').set(H.engineer!).send(body('EXCEL'))).status).toBe(403);
    expect((await t.http.post('/api/v1/reports/exports').set(H.gm!).send(body('EXCEL'))).status).toBe(201);
    expect((await t.http.post('/api/v1/reports/exports').set(H.gm!).send(body('ZIP_IMAGES'))).status).toBe(403);
    expect((await t.http.post('/api/v1/reports/exports').set(H.accountant1!).send(body('ZIP_IMAGES'))).status).toBe(201);
  });
  it('dashboard needs dashboard.view', async () => {
    expect((await t.http.get('/api/v1/dashboard/summary').set(H.accountant1!)).status).toBe(403);
    expect((await t.http.get('/api/v1/dashboard/summary').set(H.manager!)).status).toBe(200);
    expect((await t.http.get('/api/v1/dashboard/delayed').set(H.engineer!)).status).toBe(403);
    expect((await t.http.get('/api/v1/dashboard/delayed').set(H.gm!)).status).toBe(200);
  });
  it('validates bodies', async () => {
    const r = await t.http.post('/api/v1/reports/query').set(H.admin!).send({ filters: { dateField: 'nope' } });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('VALIDATION');
    expect((await t.http.post('/api/v1/reports/exports').set(H.admin!).send({ kind: 'EXE', filters: {} })).status).toBe(400);
  });
});

describe('query + auditor flow over HTTP', () => {
  it('queries with filters and group by', async () => {
    const r = await t.http.post('/api/v1/reports/query').set(H.manager!).send({ filters: filters(), groupBy: 'expenseType', page: 1, pageSize: 10 });
    expect(r.status).toBe(200);
    expect(r.body.rows).toHaveLength(1);
    expect(r.body.rows[0]).toMatchObject({ requestNumber: 'DE-26-910001', finalAmount: '42.00', imageCount: 1 });
    expect(r.body.totals).toEqual({ count: 1, originalTotal: '42.00', finalTotal: '42.00' });
    expect(r.body.groups).toHaveLength(1);
  });

  it('export -> job -> status -> signed download -> valid xlsx; audit-logged; owner-only', async () => {
    const c = await t.http.post('/api/v1/reports/exports').set(H.accountant1!).send({ kind: 'EXCEL', filters: filters(), groupBy: 'vehicle' });
    expect(c.status).toBe(201);
    const id = c.body.exportId as string;
    expect(await t.prisma.auditLog.count({ where: { action: 'reports.export.create', entityId: id } })).toBe(1);
    expect(await t.prisma.job.count({ where: { type: 'report.export', dedupeKey: `report.export:${id}` } })).toBe(1);

    const queued = await t.http.get(`/api/v1/reports/exports/${id}`).set(H.accountant1!);
    expect(queued.body).toMatchObject({ status: 'QUEUED', downloadUrl: null });

    await runExport(t.prisma, getStorage(), id);
    const done = await t.http.get(`/api/v1/reports/exports/${id}`).set(H.accountant1!);
    expect(done.body.status).toBe('DONE');
    expect(done.body.downloadUrl).toMatch(/^\/api\/v1\/files\//);
    expect(done.body.fileName).toMatch(/\.xlsx$/);

    const file = await t.http
      .get(done.body.downloadUrl)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (d: Buffer) => chunks.push(d));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(file.status).toBe(200);
    expect(file.headers['content-disposition']).toContain('.xlsx');
    expect((file.body as Buffer).subarray(0, 2).toString()).toBe('PK'); // xlsx is a zip; contents are verified in core tests
    expect((file.body as Buffer).length).toBeGreaterThan(1000);

    const mine = await t.http.get('/api/v1/reports/exports').set(H.accountant1!);
    expect(mine.body.map((e: { id: string }) => e.id)).toContain(id);
    expect((await t.http.get(`/api/v1/reports/exports/${id}`).set(H.gm!)).status).toBe(404);
    const theirs = await t.http.get('/api/v1/reports/exports').set(H.gm!);
    expect(theirs.body.map((e: { id: string }) => e.id)).not.toContain(id);
    expect((await t.http.get('/api/v1/reports/exports/nope').set(H.accountant1!)).status).toBe(404);
  });
});

describe('dashboard over HTTP', () => {
  it('returns the aggregates', async () => {
    const r = await t.http.get('/api/v1/dashboard/summary?from=2026-01-01&to=2026-01-31').set(H.manager!);
    expect(r.status).toBe(200);
    expect(r.body.totals.finalTotal).toBe('42.00');
    expect(Object.keys(r.body)).toEqual(
      expect.arrayContaining(['byPeriod', 'byVehicle', 'byExpenseType', 'topVehicles', 'avgApprovalHoursByStep', 'delayedByRole']),
    );
    expect((await t.http.get('/api/v1/dashboard/summary?from=bad').set(H.manager!)).status).toBe(400);
  });
});
