import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../helpers';

// P2-D1: submitting a request of an admin-defined type from the web.
const api = (p: string) => `/api/v1${p}`;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

let t: TestApp;
let admin: { Authorization: string };
let nobody: { Authorization: string };
let catId = '';

const field = (over: Record<string, unknown>) => ({ key: 'x', type: 'text', labelAr: 'حقل', labelEn: 'Field', required: false, order: 1, ...over });

async function makeType(code: string, prefix: string, channels: string[]) {
  const r = await t.http.post(api('/request-types')).set(admin).send({
    code,
    numberPrefix: prefix,
    nameAr: 'إجازة',
    nameEn: 'Leave',
    channels,
    headerFields: [field({ key: 'reason', required: true }), field({ key: 'days', type: 'number', min: 1, max: 30, order: 2 })],
  });
  expect(r.status).toBe(201);
  const cat = await t.http
    .post(api(`/request-types/${r.body.id}/line-categories`))
    .set(admin)
    .send({ code: 'ITEM', nameAr: 'بند', nameEn: 'Item', minAttachments: 1, maxAttachments: 2 });
  expect(cat.status).toBe(201);
  const role = await t.prisma.role.findFirstOrThrow({ where: { isActive: true } });
  const ver = await t.prisma.workflowVersion.findFirstOrThrow({ where: { workflowId: r.body.workflowId, status: 'DRAFT' } });
  const save = await t.http
    .put(api(`/workflow-versions/${ver.id}`))
    .set(admin)
    .send({ steps: [{ key: 'review', nameAr: 'مراجعة', nameEn: 'Review', roleId: role.id }] });
  expect(save.status).toBe(200);
  expect((await t.http.post(api(`/workflow-versions/${ver.id}/publish`)).set(admin)).status).toBe(200);
  return { typeId: r.body.id as string, categoryId: cat.body.id as string };
}

async function upload(h = admin) {
  const up = await t.http.post(api('/requests/attachments')).set(h).attach('file', PNG, 'r.png');
  expect(up.status).toBe(201);
  return up.body.attachmentId as string;
}

beforeAll(async () => {
  t = await createTestApp('p2-web-submit');
  admin = await t.auth('admin');
  await t.prisma.user.create({ data: { username: 'nobody', passwordHash: 'x', fullName: 'No Perms' } });
  nobody = await t.auth('nobody');
  catId = (await makeType('HR_LEAVE', 'HL', ['WEB'])).categoryId;
  await makeType('HR_TG_ONLY', 'HT', ['TELEGRAM']);
});
afterAll(async () => {
  await t?.close();
});

describe('web submission of a custom request type', () => {
  it('creates a request with header fields, a line and an attachment', async () => {
    const attachmentId = await upload();
    const body = {
      requestTypeCode: 'HR_LEAVE',
      clientKey: 'web-submit-1',
      headerValues: { reason: 'Family', days: '3' },
      lines: [{ categoryId: catId, amount: '120.50', attachmentIds: [attachmentId] }],
    };
    const r = await t.http.post(api('/requests')).set(admin).send(body);
    expect(r.status).toBe(201);
    expect(r.body.number).toMatch(/^HL-\d\d-\d{6}$/);
    const d = await t.http.get(api(`/requests/${r.body.id}`)).set(admin);
    expect(d.body.channel).toBe('WEB');
    expect(d.body.headerValues.reason).toBe('Family');
    expect(d.body.submittedByUser).not.toBeNull();
    expect(d.body.lines[0].attachments).toHaveLength(1);
    // idempotent replay returns the same request
    const again = await t.http.post(api('/requests')).set(admin).send(body);
    expect(again.body.id).toBe(r.body.id);
  });

  it('upload reports the sniffed mime type', async () => {
    const up = await t.http.post(api('/requests/attachments')).set(admin).attach('file', PNG, 'r.png');
    expect(up.body.mimeType).toBe('image/png');
  });

  it('missing required header field is a 400', async () => {
    const attachmentId = await upload();
    const r = await t.http
      .post(api('/requests'))
      .set(admin)
      .send({ requestTypeCode: 'HR_LEAVE', headerValues: { days: '2' }, lines: [{ categoryId: catId, amount: '10', attachmentIds: [attachmentId] }] });
    expect(r.status).toBe(400);
  });

  it('a type without the WEB channel is refused', async () => {
    const attachmentId = await upload();
    const cat = await t.prisma.lineCategory.findFirstOrThrow({ where: { requestType: { code: 'HR_TG_ONLY' } } });
    const r = await t.http
      .post(api('/requests'))
      .set(admin)
      .send({ requestTypeCode: 'HR_TG_ONLY', headerValues: { reason: 'x' }, lines: [{ categoryId: cat.id, amount: '10', attachmentIds: [attachmentId] }] });
    expect(r.status).toBe(400);
  });

  it('a user without requests.create gets 403 on submit and upload', async () => {
    const r = await t.http
      .post(api('/requests'))
      .set(nobody)
      .send({ requestTypeCode: 'HR_LEAVE', headerValues: { reason: 'x' }, lines: [{ categoryId: catId, amount: '10', attachmentIds: [] }] });
    expect(r.status).toBe(403);
    expect((await t.http.post(api('/requests/attachments')).set(nobody).attach('file', PNG, 'r.png')).status).toBe(403);
  });

  it('a clientKey cannot return another user\'s request', async () => {
    const other = await t.auth('supervisor');
    const attachmentId = await upload(other);
    const r = await t.http
      .post(api('/requests'))
      .set(other)
      .send({ requestTypeCode: 'HR_LEAVE', clientKey: 'web-submit-1', headerValues: { reason: 'x' }, lines: [{ categoryId: catId, amount: '10', attachmentIds: [attachmentId] }] });
    expect(r.status).toBe(409);
  });
});
