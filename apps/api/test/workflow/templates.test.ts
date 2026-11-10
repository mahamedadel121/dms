import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../helpers';

const api = (p: string) => `/api/v1${p}`;
let t: TestApp;
let admin: { Authorization: string };
let sup: { Authorization: string };
let typeId: string;
let n = 0;

const create = (over: Record<string, unknown> = {}) =>
  t.http
    .post(api('/templates'))
    .set(admin)
    .send({ requestTypeId: typeId, code: `T${++n}`, nameAr: 'قالب', nameEn: 'Tpl', ...over });

beforeAll(async () => {
  t = await createTestApp('p2-templates');
  admin = await t.auth('admin');
  sup = await t.auth('supervisor');
  typeId = (await t.prisma.requestType.findUniqueOrThrow({ where: { code: 'DRIVER_EXPENSE' } })).id;
});
afterAll(async () => {
  await t?.close();
});

describe('templates (phase 2)', () => {
  it('creates a template with a v1 draft', async () => {
    const r = await create({ code: 'NEW1', nameAr: 'اسم', nameEn: 'Name', layoutKey: 'expense-sheet' });
    expect(r.status).toBe(201);
    expect(r.body.isActive).toBe(true);
    expect(r.body.versions).toHaveLength(1);
    expect(r.body.versions[0]).toMatchObject({ version: 1, status: 'DRAFT', layoutKey: 'expense-sheet' });
    expect(r.body.versions[0].config.titleAr).toBe('اسم');
    expect(r.body.versions[0].config.titleEn).toBe('Name');
  });

  it('copies the config of another template', async () => {
    const src = await t.prisma.template.findFirstOrThrow({ where: { requestTypeId: typeId }, include: { versions: true } });
    const active = src.versions.find((v) => v.status === 'ACTIVE') ?? src.versions[0]!;
    const r = await create({ copyFromTemplateId: src.id });
    expect(r.status).toBe(201);
    expect(r.body.versions[0].config).toEqual(active.config);
  });

  it('409 on a duplicate code', async () => {
    await create({ code: 'DUP' });
    expect((await create({ code: 'DUP' })).status).toBe(409);
  });

  it('404 for an unknown request type', async () => {
    expect((await create({ requestTypeId: 'nope' })).status).toBe(404);
  });

  it('a new default clears the previous default', async () => {
    await create({ isDefault: true });
    const b = await create({ isDefault: true });
    expect(b.status).toBe(201);
    const rows = await t.prisma.template.findMany({ where: { requestTypeId: typeId, isDefault: true } });
    expect(rows.map((x) => x.id)).toEqual([b.body.id]);
  });

  it('403 without templates.manage', async () => {
    expect((await t.http.post(api('/templates')).set(sup).send({})).status).toBe(403);
    expect((await t.http.patch(api('/templates/x')).set(sup).send({ nameAr: 'x' })).status).toBe(403);
  });

  it('patches the names', async () => {
    const c = await create();
    const r = await t.http.patch(api(`/templates/${c.body.id}`)).set(admin).send({ nameAr: 'جديد', nameEn: 'Renamed' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ nameAr: 'جديد', nameEn: 'Renamed' });
    expect(r.body.versions).toHaveLength(1);
  });

  it('moves the default flag', async () => {
    const a = await create({ isDefault: true });
    const b = await create();
    const r = await t.http.patch(api(`/templates/${b.body.id}`)).set(admin).send({ isDefault: true });
    expect(r.body.isDefault).toBe(true);
    expect((await t.prisma.template.findUniqueOrThrow({ where: { id: a.body.id } })).isDefault).toBe(false);
    const off = await t.http.patch(api(`/templates/${b.body.id}`)).set(admin).send({ isDefault: false });
    expect(off.status).toBe(200);
  });

  it('refuses to deactivate the default template', async () => {
    const a = await create({ isDefault: true });
    const r = await t.http.patch(api(`/templates/${a.body.id}`)).set(admin).send({ isActive: false });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('INVALID_STATE');
  });

  it('400 on an empty patch', async () => {
    const a = await create();
    expect((await t.http.patch(api(`/templates/${a.body.id}`)).set(admin).send({})).status).toBe(400);
  });

  it('writes audit rows for create and update', async () => {
    const a = await create();
    await t.http.patch(api(`/templates/${a.body.id}`)).set(admin).send({ nameEn: 'Audited' });
    const rows = await t.prisma.auditLog.findMany({ where: { entityType: 'Template', entityId: a.body.id } });
    expect(rows.map((r) => r.action).sort()).toEqual(['template.create', 'template.update']);
  });

  it('the created draft can be saved, previewed and published', async () => {
    const a = await create();
    const v = a.body.versions[0];
    const saved = await t.http.put(api(`/template-versions/${v.id}`)).set(admin).send({ config: v.config, note: 'ok' });
    expect(saved.status).toBe(200);
    const prev = await t.http.post(api(`/template-versions/${v.id}/preview`)).set(admin).send({});
    expect(prev.status).toBe(200);
    const pub = await t.http.post(api(`/template-versions/${v.id}/publish`)).set(admin);
    expect(pub.status).toBe(200);
    expect(pub.body.status).toBe('ACTIVE');
  });
});
