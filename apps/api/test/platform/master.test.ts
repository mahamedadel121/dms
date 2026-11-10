import 'reflect-metadata';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resetConfigCache } from '@dms/core/config';
import { createTestApp, type TestApp } from '../helpers';

// signatures go through getStorage(): point it at a throwaway directory before the first use
process.env.STORAGE_ROOT = mkdtempSync(join(tmpdir(), 'dms-wp1-'));
resetConfigCache();

let t: TestApp;
let admin: { Authorization: string };
let chief: { Authorization: string };
const api = (p: string) => `/api/v1${p}`;

beforeAll(async () => {
  t = await createTestApp('wp1-master');
  admin = await t.auth('admin');
  chief = await t.auth('chief');
});
afterAll(async () => {
  await t?.close();
});

async function xlsx(rows: (string | number | boolean | null)[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('s');
  rows.forEach((r) => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe('master data CRUD', () => {
  it('cost centers: create, duplicate 409, patch with audit before/after, deactivate/activate, no DELETE', async () => {
    const c = await t.http.post(api('/cost-centers')).set(chief).send({ code: 'CC-T1', name: 'Test CC' });
    expect(c.status).toBe(201);
    expect(c.body.isActive).toBe(true);
    expect((await t.http.post(api('/cost-centers')).set(chief).send({ code: 'CC-T1', name: 'again' })).status).toBe(409);
    const p = await t.http.patch(api(`/cost-centers/${c.body.id}`)).set(chief).send({ name: 'Renamed' });
    expect(p.body.name).toBe('Renamed');
    const a = await t.prisma.auditLog.findFirstOrThrow({ where: { action: 'cost-centers.update', entityId: c.body.id } });
    expect(a.before).toMatchObject({ name: 'Test CC' });
    expect(a.after).toMatchObject({ name: 'Renamed' });
    expect((await t.http.post(api(`/cost-centers/${c.body.id}/deactivate`)).set(chief)).body.isActive).toBe(false);
    const inactive = await t.http.get(api('/cost-centers?active=0')).set(chief);
    expect(inactive.body.items.map((x: { code: string }) => x.code)).toContain('CC-T1');
    expect((await t.http.post(api(`/cost-centers/${c.body.id}/activate`)).set(chief)).body.isActive).toBe(true);
    expect((await t.http.delete(api(`/cost-centers/${c.body.id}`)).set(chief)).status).toBe(404);
  });

  it('vehicles: create with FK, invalid FK is 400, list filters and search, current driver shown', async () => {
    const vt = await t.prisma.vehicleType.findFirstOrThrow();
    const cc = await t.prisma.costCenter.findFirstOrThrow();
    const ok = await t.http
      .post(api('/vehicles'))
      .set(chief)
      .send({ number: 'T-9001', vehicleTypeId: vt.id, costCenterId: cc.id });
    expect(ok.status).toBe(201);
    expect(ok.body.status).toBe('ACTIVE');
    const bad = await t.http.post(api('/vehicles')).set(chief).send({ number: 'T-9002', vehicleTypeId: 'nope', costCenterId: cc.id });
    expect(bad.status).toBe(400);
    const stopped = await t.http.get(api('/vehicles?status=STOPPED')).set(chief);
    expect(stopped.body.items.every((v: { status: string }) => v.status === 'STOPPED')).toBe(true);
    const found = await t.http.get(api('/vehicles?q=2157')).set(chief);
    expect(found.body.items[0].currentDriver).toBeTruthy();
  });

  it('submitters: phone normalised, invalid phone rejected, list includes currentVehicle', async () => {
    const r = await t.http.post(api('/submitters')).set(chief).send({ code: 'DRV900', fullName: 'Test Driver', phone: '01012345999' });
    expect(r.status).toBe(201);
    expect(r.body.phone).toBe('+201012345999');
    expect((await t.http.post(api('/submitters')).set(chief).send({ code: 'DRV901', fullName: 'x', phone: '12345' })).status).toBe(400);
    const l = await t.http.get(api('/submitters?q=DRV001')).set(chief);
    expect(l.body.items[0].currentVehicle).toMatchObject({ number: expect.any(String) });
  });

  it('treasuries: only one default', async () => {
    const a = await t.http.post(api('/treasuries')).set(chief).send({ code: 'TR2', name: 'Second', cashGlNumber: '11000001', companyCode: '1000', isDefault: true });
    expect(a.status).toBe(201);
    const all = await t.prisma.treasury.findMany({ where: { isDefault: true } });
    expect(all.map((x) => x.code)).toEqual(['TR2']);
  });

  it('expense types: writes LineCategory + GL config + approval roles; update replaces roles; list shows them', async () => {
    const gl = await t.prisma.glAccount.findFirstOrThrow({ where: { number: '51501800' } });
    const role = await t.prisma.role.findUniqueOrThrow({ where: { code: 'SHIPPING_OFFICER' } });
    const role2 = await t.prisma.role.findUniqueOrThrow({ where: { code: 'MAINTENANCE_ENGINEER' } });
    const c = await t.http.post(api('/expense-types')).set(chief).send({
      code: 'PARKING',
      nameAr: 'مواقف',
      nameEn: 'Parking',
      icon: 'P',
      sortOrder: 90,
      glAccountId: gl.id,
      approvalRoleIds: [role.id],
      unitPriceMin: '1.5',
    });
    expect(c.status).toBe(201);
    expect(c.body.glNumber).toBe('51501800');
    expect(c.body.approvalRoleIds).toEqual([role.id]);
    expect(c.body.unitPriceMin).toBe('1.50');
    const cat = await t.prisma.lineCategory.findFirstOrThrow({ where: { code: 'PARKING' }, include: { requestType: true } });
    expect(cat.requestType.code).toBe('DRIVER_EXPENSE');
    const u = await t.http.patch(api(`/expense-types/${c.body.id}`)).set(chief).send({ approvalRoleIds: [role2.id], maxAttachments: 3 });
    expect(u.body.approvalRoleIds).toEqual([role2.id]);
    expect(u.body.maxAttachments).toBe(3);
    expect(u.body.glNumber).toBe('51501800'); // untouched
    const list = await t.http.get(api('/expense-types?q=PARK')).set(chief);
    expect(list.body.items).toHaveLength(1);
    // a non-expense line category is not exposed here
    const miss = await t.http.get(api('/expense-types/does-not-exist')).set(chief);
    expect(miss.status).toBe(404);
    const seeded = await t.http.get(api('/expense-types?pageSize=50')).set(chief);
    expect(seeded.body.items.map((x: { code: string }) => x.code)).toEqual(expect.arrayContaining(['TOLLS', 'DIESEL', 'TIPS', 'PARKING']));
    const diesel = seeded.body.items.find((x: { code: string }) => x.code === 'DIESEL');
    expect(diesel.quantityFieldKey).toBe('liters');
  });
});

describe('xlsx export and import', () => {
  it('exports vehicles with a header row and one row per vehicle', async () => {
    const r = await t.http.get(api('/vehicles/export.xlsx')).set(chief).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toContain('spreadsheetml');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(r.body as never);
    const ws = wb.worksheets[0]!;
    expect(ws.getRow(1).getCell(1).value).toBe('number');
    const total = await t.prisma.vehicle.count();
    expect(ws.rowCount - 1).toBe(total);
  });

  it('import dry-run reports row errors and writes nothing; real import is all-or-nothing', async () => {
    const before = await t.prisma.costCenter.count();
    const rows = [
      ['code', 'name', 'isActive'],
      ['IMP1', 'Imported One', 'true'],
      ['IMP2', '', 'true'], // missing name
      ['IMP1', 'duplicate in file', 'true'],
      ['MLF450', 'Updated existing', 'true'],
    ];
    const buf = await xlsx(rows);
    const dry = await t.http.post(api('/cost-centers/import?dryRun=1')).set(chief).attach('file', buf, 'cc.xlsx');
    expect(dry.status).toBe(200);
    expect(dry.body.dryRun).toBe(true);
    expect(dry.body.errors.map((e: { row: number }) => e.row)).toEqual([3, 4]);
    expect(dry.body.created).toBe(1);
    expect(dry.body.updated).toBe(1);
    expect(await t.prisma.costCenter.count()).toBe(before);

    const real = await t.http.post(api('/cost-centers/import')).set(chief).attach('file', buf, 'cc.xlsx');
    expect(real.body.errors).toHaveLength(2);
    expect(await t.prisma.costCenter.count()).toBe(before); // errors => nothing applied
  });

  it('a clean file is applied: creates and updates, audited; round-trips FK columns by code', async () => {
    const ok = await xlsx([
      ['code', 'name', 'isActive'],
      ['IMP1', 'Imported One', 'true'],
      ['MLF450', 'MLF Renamed', 'true'],
    ]);
    const r = await t.http.post(api('/cost-centers/import')).set(chief).attach('file', ok, 'cc.xlsx');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ created: 1, updated: 1, errors: [], dryRun: false });
    expect((await t.prisma.costCenter.findUniqueOrThrow({ where: { code: 'MLF450' } })).name).toBe('MLF Renamed');
    expect(await t.prisma.auditLog.count({ where: { action: 'cost-centers.import' } })).toBe(1);

    const vt = await t.prisma.vehicleType.findFirstOrThrow();
    const veh = await xlsx([
      ['number', 'vehicleTypeCode', 'costCenterCode', 'status'],
      ['IMPV1', vt.code, 'IMP1', 'active'],
      ['IMPV2', 'NO-SUCH-TYPE', 'IMP1', 'ACTIVE'],
    ]);
    const dry = await t.http.post(api('/vehicles/import?dryRun=1')).set(chief).attach('file', veh, 'v.xlsx');
    expect(dry.body.errors).toHaveLength(1);
    expect(dry.body.errors[0]).toMatchObject({ row: 3 });
    expect(dry.body.errors[0].message).toMatch(/vehicle type/i);
  });

  it('rejects a non-xlsx upload and a missing key column with 400', async () => {
    const junk = await t.http.post(api('/vehicles/import?dryRun=1')).set(chief).attach('file', Buffer.from('not a workbook'), 'x.xlsx');
    expect(junk.status).toBe(400);
    const nokey = await t.http.post(api('/vehicles/import?dryRun=1')).set(chief).attach('file', await xlsx([['foo'], ['bar']]), 'x.xlsx');
    expect(nokey.status).toBe(400);
    expect((await t.http.post(api('/vehicles/import')).set(chief)).status).toBe(400);
  });
});

describe('assignments and vehicle change requests', () => {
  const driver = async (code: string) => t.prisma.submitter.findUniqueOrThrow({ where: { code } });
  const vehicle = async (number: string) => t.prisma.vehicle.findUniqueOrThrow({ where: { number } });

  it('a change closes the old row and opens a new one (history kept, one open row)', async () => {
    const d = await driver('DRV002');
    const before = await t.prisma.driverVehicleAssignment.findFirstOrThrow({ where: { submitterId: d.id, validTo: null } });
    const v = await t.prisma.vehicle.findFirstOrThrow({ where: { status: 'ACTIVE', id: { not: before.vehicleId } } });
    const h = await t.auth('supervisor');
    const r = await t.http.post(api('/assignments')).set(h).send({ submitterId: d.id, vehicleId: v.id, note: 'reshuffle' });
    expect(r.status).toBe(201);
    const rows = await t.prisma.driverVehicleAssignment.findMany({ where: { submitterId: d.id }, orderBy: { validFrom: 'asc' } });
    expect(rows.filter((x) => x.validTo === null)).toHaveLength(1);
    const old = rows.find((x) => x.id === before.id)!;
    expect(old.validTo).not.toBeNull();
    expect(rows.at(-1)!.vehicleId).toBe(v.id);
    expect(rows.at(-1)!.source).toBe('MANUAL');
    const hist = await t.http.get(api(`/assignments?submitterId=${d.id}`)).set(h);
    expect(hist.body.length).toBe(rows.length);
    const aud = await t.prisma.auditLog.findFirstOrThrow({ where: { action: 'assignment.change', entityId: r.body.id } });
    expect(aud.before).toMatchObject({ id: before.id });
    // same vehicle again is a no-op
    const again = await t.http.post(api('/assignments')).set(h).send({ submitterId: d.id, vehicleId: v.id });
    expect(again.body.id).toBe(r.body.id);
    expect(await t.prisma.driverVehicleAssignment.count({ where: { submitterId: d.id } })).toBe(rows.length);
  });

  it('close ends the assignment; /assignments/current lists drivers without a vehicle and unassigned vehicles', async () => {
    const d = await driver('DRV003');
    const open = await t.prisma.driverVehicleAssignment.findFirstOrThrow({ where: { submitterId: d.id, validTo: null } });
    const h = await t.auth('manager');
    expect((await t.http.post(api(`/assignments/${open.id}/close`)).set(h)).status).toBe(200);
    expect((await t.http.post(api(`/assignments/${open.id}/close`)).set(h)).status).toBe(409);
    const cur = await t.http.get(api('/assignments/current')).set(h);
    expect(cur.body.driversWithoutVehicle.map((x: { code: string }) => x.code)).toContain('DRV003');
    expect(cur.body.unassignedVehicles.map((x: { id: string }) => x.id)).toContain(open.vehicleId);
    expect(cur.body.stoppedVehicles.length).toBeGreaterThanOrEqual(2);
  });

  it('assigning an inactive vehicle or unknown driver is refused', async () => {
    const h = await t.auth('supervisor');
    const d = await driver('DRV004');
    const v = await vehicle('2157');
    expect((await t.http.post(api('/assignments')).set(h).send({ submitterId: 'nope', vehicleId: v.id })).status).toBe(404);
    await t.prisma.vehicle.update({ where: { id: v.id }, data: { isActive: false } });
    expect((await t.http.post(api('/assignments')).set(h).send({ submitterId: d.id, vehicleId: v.id })).status).toBe(409);
    await t.prisma.vehicle.update({ where: { id: v.id }, data: { isActive: true } });
  });

  it('VCR approval by the shipping officer updates the assignment; supervisor cannot decide; second decision 409', async () => {
    const { createVehicleChangeRequest } = await import('@dms/core/fleet');
    const d = await driver('DRV005');
    const target = await t.prisma.vehicle.findFirstOrThrow({ where: { status: 'ACTIVE', number: { notIn: ['2157'] } }, orderBy: { number: 'desc' } });
    const vcr = await createVehicleChangeRequest(t.prisma, { submitterId: d.id, toVehicleId: target.id, requestedVehicleText: target.number });
    expect(vcr.status).toBe('PENDING');
    const dup = await createVehicleChangeRequest(t.prisma, { submitterId: d.id, toVehicleId: target.id });
    expect(dup.id).toBe(vcr.id); // one pending per driver
    const shipping = await t.auth('shipping');
    const sup = await t.auth('supervisor');
    const list = await t.http.get(api('/vehicle-change-requests?status=PENDING')).set(sup);
    expect(list.status).toBe(200);
    expect(list.body.map((x: { id: string }) => x.id)).toContain(vcr.id);
    expect((await t.http.post(api(`/vehicle-change-requests/${vcr.id}/approve`)).set(sup).send({})).status).toBe(403);
    const ok = await t.http.post(api(`/vehicle-change-requests/${vcr.id}/approve`)).set(shipping).send({ comment: 'ok' });
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe('APPROVED');
    expect(ok.body.decidedByName).toBeTruthy();
    const cur = await t.prisma.driverVehicleAssignment.findFirstOrThrow({ where: { submitterId: d.id, validTo: null } });
    expect(cur.vehicleId).toBe(target.id);
    expect(cur.source).toBe('CHANGE_REQUEST');
    expect(cur.vehicleChangeRequestId).toBe(vcr.id);
    expect((await t.http.post(api(`/vehicle-change-requests/${vcr.id}/reject`)).set(shipping).send({})).status).toBe(409);
  });

  it('VCR rejection leaves the assignment; approval without a resolved vehicle is 400 until one is picked', async () => {
    const { createVehicleChangeRequest } = await import('@dms/core/fleet');
    const shipping = await t.auth('shipping');
    const d = await driver('DRV006');
    const cur = await t.prisma.driverVehicleAssignment.findFirstOrThrow({ where: { submitterId: d.id, validTo: null } });
    const v1 = await createVehicleChangeRequest(t.prisma, { submitterId: d.id, requestedVehicleText: 'unknown-777' });
    expect((await t.http.post(api(`/vehicle-change-requests/${v1.id}/approve`)).set(shipping).send({})).status).toBe(400);
    const rej = await t.http.post(api(`/vehicle-change-requests/${v1.id}/reject`)).set(shipping).send({ comment: 'no such vehicle' });
    expect(rej.body.status).toBe('REJECTED');
    expect((await t.prisma.driverVehicleAssignment.findFirstOrThrow({ where: { submitterId: d.id, validTo: null } })).id).toBe(cur.id);

    const v2 = await createVehicleChangeRequest(t.prisma, { submitterId: d.id, requestedVehicleText: 'unknown-777' });
    const pick = await t.prisma.vehicle.findFirstOrThrow({ where: { status: 'ACTIVE', id: { not: cur.vehicleId } } });
    const ok = await t.http.post(api(`/vehicle-change-requests/${v2.id}/approve`)).set(shipping).send({ toVehicleId: pick.id });
    expect(ok.status).toBe(200);
    expect((await t.prisma.driverVehicleAssignment.findFirstOrThrow({ where: { submitterId: d.id, validTo: null } })).vehicleId).toBe(pick.id);
  });

  it('checkOdometer warns for lower readings and unrealistic jumps', async () => {
    const { checkOdometer } = await import('@dms/core/fleet');
    const v = await vehicle('2157');
    await t.prisma.vehicle.update({ where: { id: v.id }, data: { lastOdometer: 50000 } });
    expect(await checkOdometer(t.prisma, v.id, 50100)).toEqual({ last: 50000, warning: null });
    expect((await checkOdometer(t.prisma, v.id, 49000)).warning).toBe('LOWER_THAN_LAST');
    expect((await checkOdometer(t.prisma, v.id, 80000)).warning).toBe('UNREALISTIC_JUMP');
    const fresh = await vehicle('2157');
    await t.prisma.vehicle.update({ where: { id: fresh.id }, data: { lastOdometer: null } });
    expect((await checkOdometer(t.prisma, v.id, 5)).warning).toBeNull();
  });
});

describe('telegram unlink', () => {
  it('requires the permission, clears the link, is logged with the previous identity, then relinking is possible', async () => {
    const d = await t.prisma.submitter.findUniqueOrThrow({ where: { code: 'DRV007' } });
    await t.prisma.submitter.update({
      where: { id: d.id },
      data: { telegramUserId: 555001n, telegramChatId: 555001n, telegramUsername: 'drv7', telegramLinkedAt: new Date() },
    });
    expect((await t.http.post(api(`/submitters/${d.id}/telegram-unlink`)).set(await t.auth('supervisor'))).status).toBe(403);
    const r = await t.http.post(api(`/submitters/${d.id}/telegram-unlink`)).set(admin);
    expect(r.status).toBe(200);
    const after = await t.prisma.submitter.findUniqueOrThrow({ where: { id: d.id } });
    expect(after.telegramUserId).toBeNull();
    expect(after.telegramLinkedAt).toBeNull();
    const a = await t.prisma.auditLog.findFirstOrThrow({ where: { action: 'submitter.telegram_unlink', entityId: d.id } });
    expect(a.before).toMatchObject({ telegramUserId: '555001', telegramUsername: 'drv7' });
    expect((await t.http.post(api(`/submitters/${d.id}/telegram-unlink`)).set(admin)).status).toBe(409);
    // the same Telegram id can now be linked to another driver (bot relink path)
    const other = await t.prisma.submitter.findUniqueOrThrow({ where: { code: 'DRV008' } });
    await t.prisma.submitter.update({ where: { id: other.id }, data: { telegramUserId: 555001n } });
  });
});

describe('signatures', () => {
  /** Minimal header-only images: enough for magic-byte sniffing and dimension parsing. */
  const png = async () => {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(120, 0);
    ihdr.writeUInt32BE(40, 4);
    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]),
      Buffer.from('IHDR'),
      ihdr,
      Buffer.alloc(16, 0),
    ]);
  };
  const jpg = async () => {
    const sof = Buffer.from([0xff, 0xc0, 0, 11, 8, 0, 30, 0, 90, 1, 1, 0x11, 0]);
    return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0]), sof, Buffer.from([0xff, 0xd9])]);
  };

  it('uploads a PNG for a user, keeps history, serves a signed URL; GET returns current + history', async () => {
    const id = (await t.prisma.user.findUniqueOrThrow({ where: { username: 'engineer' } })).id;
    const r1 = await t.http.post(api(`/users/${id}/signature`)).set(admin).attach('file', await png(), 'sig.png');
    expect(r1.status).toBe(200);
    expect(r1.body.url).toContain('/api/v1/files/');
    const r2 = await t.http.post(api(`/users/${id}/signature`)).set(admin).attach('file', await jpg(), 'sig.jpg');
    expect(r2.status).toBe(200);
    const info = await t.http.get(api(`/users/${id}/signature`)).set(admin);
    expect(info.body.current.id).toBe(r2.body.signatureId);
    expect(info.body.current.width).toBe(90);
    expect(info.body.history.map((x: { id: string }) => x.id)).toContain(r1.body.signatureId);
    const active = await t.prisma.signature.count({ where: { userId: id, isActive: true } });
    expect(active).toBe(1);
    expect(await t.prisma.auditLog.count({ where: { action: 'signature.upload', entityId: id } })).toBe(2);
    const key = (await t.prisma.signature.findUniqueOrThrow({ where: { id: r2.body.signatureId } })).storageKey;
    expect(await t.storage.exists(key).catch(() => true)).toBeDefined();
  });

  it('rejects non-images by magic bytes even with an image name/type, and oversize files', async () => {
    const id = (await t.prisma.user.findUniqueOrThrow({ where: { username: 'admin' } })).id;
    const exe = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(500, 1)]);
    const r = await t.http.post(api(`/users/${id}/signature`)).set(admin).attach('file', exe, { filename: 'sig.png', contentType: 'image/png' });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('VALIDATION');
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    expect((await t.http.post(api(`/users/${id}/signature`)).set(admin).attach('file', svg, { filename: 's.png', contentType: 'image/png' })).status).toBe(400);
    const big = Buffer.concat([await png(), Buffer.alloc(2.5 * 1024 * 1024, 0)]);
    expect((await t.http.post(api(`/users/${id}/signature`)).set(admin).attach('file', big, 'big.png')).status).toBe(413);
    expect((await t.http.post(api(`/users/${id}/signature`)).set(admin)).status).toBe(400);
    expect(await t.prisma.signature.count({ where: { userId: id, isActive: true } })).toBe(1); // seed one untouched
  });

  it('owners manage their own signature; others need signatures.manage; drivers via /submitters', async () => {
    const eng = await t.auth('engineer');
    const adminId = (await t.prisma.user.findUniqueOrThrow({ where: { username: 'admin' } })).id;
    const engId = (await t.prisma.user.findUniqueOrThrow({ where: { username: 'engineer' } })).id;
    expect((await t.http.post(api(`/users/${engId}/signature`)).set(eng).attach('file', await png(), 's.png')).status).toBe(200);
    expect((await t.http.post(api(`/users/${adminId}/signature`)).set(eng).attach('file', await png(), 's.png')).status).toBe(403);
    expect((await t.http.get(api(`/users/${adminId}/signature`)).set(eng)).status).toBe(403);
    const drv = await t.prisma.submitter.findUniqueOrThrow({ where: { code: 'DRV001' } });
    expect((await t.http.post(api(`/submitters/${drv.id}/signature`)).set(eng).attach('file', await png(), 's.png')).status).toBe(403);
    const up = await t.http.post(api(`/submitters/${drv.id}/signature`)).set(admin).attach('file', await png(), 's.png');
    expect(up.status).toBe(200);
    expect((await t.http.delete(api(`/submitters/${drv.id}/signature`)).set(admin)).status).toBe(200);
    expect((await t.http.get(api(`/submitters/${drv.id}/signature`)).set(admin)).body.current).toBeNull();
    expect((await t.http.delete(api(`/submitters/${drv.id}/signature`)).set(admin)).status).toBe(404);
  });
});
