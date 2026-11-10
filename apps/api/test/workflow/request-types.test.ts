import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { registerExpenseModule } from '@dms/core/expense';
import { createTestApp, type TestApp } from '../helpers';

const api = (p: string) => `/api/v1${p}`;
let t: TestApp;
let admin: { Authorization: string };
let sup: { Authorization: string };

const field = (over: Record<string, unknown> = {}) => ({ key: 'plate', type: 'text', labelAr: 'اللوحة', labelEn: 'Plate', required: false, ...over });
const newType = (code: string, prefix: string, extra: Record<string, unknown> = {}) =>
  t.http.post(api('/request-types')).set(admin).send({ code, numberPrefix: prefix, nameAr: 'نوع', nameEn: 'Type', ...extra });
const newCat = (typeId: string, code: string, extra: Record<string, unknown> = {}) =>
  t.http.post(api(`/request-types/${typeId}/line-categories`)).set(admin).send({ code, nameAr: code, nameEn: code, ...extra });

beforeAll(async () => {
  t = await createTestApp('p2-request-types');
  registerExpenseModule();
  admin = await t.auth('admin');
  sup = await t.auth('supervisor');
});
afterAll(async () => {
  await t?.close();
});

describe('request types (phase 2)', () => {
  it('401 without a token', async () => {
    expect((await t.http.get(api('/request-types'))).status).toBe(401);
    expect((await t.http.get(api('/request-types/modules'))).status).toBe(401);
  });

  it('lists stats when asked', async () => {
    const r = await t.http.get(api('/request-types?withStats=1')).set(admin);
    expect(r.status).toBe(200);
    const d = r.body.find((x: { code: string }) => x.code === 'DRIVER_EXPENSE');
    expect(d.stats.categoryCount).toBeGreaterThan(0);
    expect(d.stats.templateCount).toBeGreaterThan(0);
    expect(d.stats.activeWorkflowVersion).toBeGreaterThanOrEqual(1);
    expect(typeof d.stats.requestCount).toBe('number');
    const plain = await t.http.get(api('/request-types')).set(admin);
    expect(plain.body[0].stats).toBeUndefined();
  });

  it('lists registered modules', async () => {
    const r = await t.http.get(api('/request-types/modules')).set(sup);
    expect(r.status).toBe(200);
    expect(r.body).toContainEqual({ key: 'expense' });
  });

  it('rejects a badly formatted header field key', async () => {
    const r = await newType('BADKEY', 'BK', { headerFields: [field({ key: 'Bad Key' })] });
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.body.error.details)).toContain('KEY_FORMAT');
  });

  it('rejects a reserved key for the expense module', async () => {
    const r = await newType('RESV', 'RS', { moduleKey: 'expense', headerFields: [field({ key: 'odometer' })] });
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.body.error.details)).toContain('KEY_RESERVED');
  });

  it('rejects an unknown module key', async () => {
    expect((await newType('NOMOD', 'NM', { moduleKey: 'nope' })).status).toBe(400);
  });

  it('stores and returns allowedMimeTypes', async () => {
    const ty = await newType('MIME', 'MM');
    expect(ty.status).toBe(201);
    const c = await newCat(ty.body.id, 'DOC', { allowedMimeTypes: ['application/pdf'] });
    expect(c.status).toBe(201);
    expect(c.body.allowedMimeTypes).toEqual(['application/pdf']);
    const p = await t.http
      .patch(api(`/request-types/${ty.body.id}/line-categories/${c.body.id}`))
      .set(admin)
      .send({ allowedMimeTypes: ['image/png', 'application/pdf'] });
    expect(p.body.allowedMimeTypes).toEqual(['image/png', 'application/pdf']);
  });

  it('rejects a quantity field that is not a number field', async () => {
    const ty = await newType('QTY', 'QT');
    const r = await newCat(ty.body.id, 'Q', { extraFields: [field({ key: 'note' })], quantityFieldKey: 'note' });
    expect(r.status).toBe(400);
  });

  it('rejects min attachments above max', async () => {
    const ty = await newType('MINMAX', 'MX');
    const r = await newCat(ty.body.id, 'M', { minAttachments: 5, maxAttachments: 2 });
    expect(r.status).toBe(400);
  });

  it('reorders line categories', async () => {
    const ty = await newType('ORD', 'OR');
    const ids: string[] = [];
    for (const code of ['A', 'B', 'C']) ids.push((await newCat(ty.body.id, code)).body.id);
    const order = [ids[2]!, ids[0]!, ids[1]!];
    const r = await t.http.put(api(`/request-types/${ty.body.id}/line-categories/order`)).set(admin).send({ ids: order });
    expect(r.status).toBe(200);
    const rows = await t.prisma.lineCategory.findMany({ where: { requestTypeId: ty.body.id }, orderBy: { sortOrder: 'asc' } });
    expect(rows.map((x) => x.id)).toEqual(order);
    expect(rows.map((x) => x.sortOrder)).toEqual([0, 10, 20]);
    expect(await t.prisma.auditLog.count({ where: { action: 'line_category.reorder', entityId: ty.body.id } })).toBe(1);
  });

  it('rejects an order that is not the exact id set', async () => {
    const ty = await newType('ORD2', 'O2');
    const c = await newCat(ty.body.id, 'A');
    await newCat(ty.body.id, 'B');
    const r = await t.http.put(api(`/request-types/${ty.body.id}/line-categories/order`)).set(admin).send({ ids: [c.body.id] });
    expect(r.status).toBe(400);
  });

  it('403 for a user without request_types.manage', async () => {
    expect((await t.http.post(api('/request-types')).set(sup).send({})).status).toBe(403);
    expect((await t.http.put(api('/request-types/x/line-categories/order')).set(sup).send({ ids: ['a'] })).status).toBe(403);
  });
});
