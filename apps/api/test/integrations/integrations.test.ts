import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resetConfigCache } from '@dms/core/config';
import { closePdfBrowser, createRequestFixture, finalizeRequestPdf } from '@dms/core/pdf';
import { MockSapAdapter, getSapAdapter, processSapPosting } from '@dms/core/sap';
import { getStorage } from '@dms/core/storage';
import { createTestApp, type TestApp } from '../helpers';

let t: TestApp;
let storage: ReturnType<typeof getStorage>;
let admin: { Authorization: string };

beforeAll(async () => {
  process.env.STORAGE_ROOT = mkdtempSync(join(tmpdir(), 'dms-int-'));
  resetConfigCache();
  storage = getStorage();
  t = await createTestApp('wp4-int');
  admin = await t.auth('admin');
});
afterAll(async () => {
  await closePdfBrowser();
  await t?.close();
});

const bin = (res: import('supertest').Response, cb: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

describe('PDF endpoints', () => {
  it('requires authentication', async () => {
    await t.http.get('/api/v1/requests/x/pdf').expect(401);
    await t.http.get('/api/v1/sap/postings').expect(401);
  });

  it('serves a live preview before payment and the locked final after', async () => {
    const f = await createRequestFixture(t.prisma, { status: 'IN_REVIEW', approvedUpTo: 1, storage: storage });
    const r = await t.http.get(`/api/v1/requests/${f.requestId}/pdf`).set(admin).buffer(true).parse(bin).expect(200);
    expect(r.headers['content-type']).toContain('application/pdf');
    expect(r.headers['x-document-state']).toBe('preview');
    expect((r.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');

    const g = await createRequestFixture(t.prisma, { scenario: 'both', storage: storage });
    const doc = await finalizeRequestPdf(t.prisma, storage, g.requestId);
    const r2 = await t.http.get(`/api/v1/requests/${g.requestId}/pdf`).set(admin).buffer(true).parse(bin).expect(200);
    expect(r2.headers['x-document-state']).toBe('final');
    expect(r2.headers['x-document-sha256']).toBe(doc.sha256);
    const v = await t.http.get(`/api/v1/requests/${g.requestId}/pdf/verify`).set(admin).expect(200);
    expect(v.body).toMatchObject({ ok: true, sha256: doc.sha256, locked: true });
    const none = await t.http.get(`/api/v1/requests/${f.requestId}/pdf/verify`).set(admin).expect(200);
    expect(none.body).toMatchObject({ ok: false, sha256: null });
  }, 90_000);

  it('hides requests the user cannot see (404) and unknown ids', async () => {
    const f = await createRequestFixture(t.prisma, { scenario: 'neither', storage: storage });
    const eng = await t.auth('engineer'); // no step of the maintenance role on this request
    const r = await t.http.get(`/api/v1/requests/${f.requestId}/pdf`).set(eng);
    expect([403, 404]).toContain(r.status);
    await t.http.get('/api/v1/requests/nope/pdf').set(admin).expect(404);
  });
});

describe('template preview', () => {
  it('returns HTML with sample data, with an override config, and for a real request; PDF format', async () => {
    const tv = await t.prisma.templateVersion.findFirstOrThrow({ where: { status: 'ACTIVE' } });
    const h = await t.http.post(`/api/v1/template-versions/${tv.id}/preview`).set(admin).send({}).expect(200);
    expect(h.headers['content-type']).toContain('text/html');
    expect(h.text).toContain('dir="rtl"');
    expect(h.text).toContain('كشف مصاريف');

    const cfg = { ...(tv.config as object), titleAr: 'عنوان مخصص' };
    const h2 = await t.http.post(`/api/v1/template-versions/${tv.id}/preview?format=html`).set(admin).send({ config: cfg }).expect(200);
    expect(h2.text).toContain('عنوان مخصص');

    const f = await createRequestFixture(t.prisma, { scenario: 'tips', storage: storage });
    const h3 = await t.http.post(`/api/v1/template-versions/${tv.id}/preview`).set(admin).send({ requestId: f.requestId }).expect(200);
    expect(h3.text).toContain(f.number);

    const p = await t.http.post(`/api/v1/template-versions/${tv.id}/preview?format=pdf`).set(admin).send({}).buffer(true).parse(bin).expect(200);
    expect((p.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    await t.http.post(`/api/v1/template-versions/${tv.id}/preview?format=xml`).set(admin).send({}).expect(400);
  }, 90_000);

  it('needs templates.manage', async () => {
    const tv = await t.prisma.templateVersion.findFirstOrThrow({ where: { status: 'ACTIVE' } });
    await t.http.post(`/api/v1/template-versions/${tv.id}/preview`).set(await t.auth('supervisor')).send({}).expect(403);
  });
});

describe('SAP monitor', () => {
  it('lists, filters, shows attempts + payload, retries a failed posting once', async () => {
    const mock = getSapAdapter('mock') as MockSapAdapter;
    const f = await createRequestFixture(t.prisma, { withSapPosting: true, storage: storage });
    mock.failNext(1);
    await expect(processSapPosting(t.prisma, f.postingId!)).rejects.toThrow();

    const list = await t.http.get(`/api/v1/sap/postings?status=FAILED&number=${f.number}`).set(admin).expect(200);
    expect(list.body.total).toBe(1);
    expect(list.body.items[0]).toMatchObject({ id: f.postingId, requestNumber: f.number, status: 'FAILED', attempts: 1 });

    const d = await t.http.get(`/api/v1/sap/postings/${f.postingId}`).set(admin).expect(200);
    expect(d.body.payload.reference).toBe(f.number);
    expect(d.body.attemptLogs).toHaveLength(1);
    expect(d.body.attemptLogs[0]).toMatchObject({ success: false, trigger: 'AUTO' });

    // no job existed in this fixture; retry enqueues one and the worker path posts it
    const r = await t.http.post(`/api/v1/sap/postings/${f.postingId}/retry`).set(admin).expect(201);
    expect(r.body.status).toBe('PENDING');
    const job = await t.prisma.job.findUniqueOrThrow({ where: { dedupeKey: `sap.post:${f.requestId}` } });
    expect(job.payload).toMatchObject({ postingId: f.postingId, trigger: 'MANUAL' });
    expect(await t.prisma.auditLog.count({ where: { action: 'sap.retry', entityId: f.postingId } })).toBe(1);
    await processSapPosting(t.prisma, f.postingId!, { trigger: 'MANUAL', userId: job.payload ? (job.payload as { userId: string }).userId : undefined });
    await t.http.post(`/api/v1/sap/postings/${f.postingId}/retry`).set(admin).expect(409);
    await t.http.get('/api/v1/sap/postings/nope').set(admin).expect(404);
  });

  it('enforces sap.view / sap.retry', async () => {
    const sup = await t.auth('supervisor');
    await t.http.get('/api/v1/sap/postings').set(sup).expect(403);
    await t.http.post('/api/v1/sap/postings/x/retry').set(sup).expect(403);
  });
});
