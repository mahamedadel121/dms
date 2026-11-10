import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MockSapAdapter, getSapAdapter, processSapPosting } from '@dms/core/sap';
import { createRequestFixture } from '@dms/core/pdf';
import { createTestApp, type TestApp } from '../helpers';

let t: TestApp;
let admin: { Authorization: string };

beforeAll(async () => {
  t = await createTestApp('p2-sap-retry');
  admin = await t.auth('admin');
});
afterAll(async () => {
  await t?.close();
});

async function failedPosting() {
  const mock = getSapAdapter('mock') as MockSapAdapter;
  const f = await createRequestFixture(t.prisma, { withSapPosting: true });
  mock.failNext(1);
  await expect(processSapPosting(t.prisma, f.postingId!)).rejects.toThrow();
  return f;
}

describe('SAP retry (phase 2)', () => {
  it('retry without a body behaves as before', async () => {
    const f = await failedPosting();
    const r = await t.http.post(`/api/v1/sap/postings/${f.postingId}/retry`).set(admin).expect(201);
    expect(r.body.status).toBe('PENDING');
    const job = await t.prisma.job.findUniqueOrThrow({ where: { dedupeKey: `sap.post:${f.requestId}` } });
    expect(job.payload).toMatchObject({ trigger: 'MANUAL', force: false });
    expect(await t.prisma.auditLog.count({ where: { action: 'sap.posting.force_retry', entityId: f.postingId } })).toBe(0);
  });

  it('retry with force stores force on the job and audits', async () => {
    const f = await failedPosting();
    await t.http.post(`/api/v1/sap/postings/${f.postingId}/retry`).set(admin).send({ force: true }).expect(201);
    const job = await t.prisma.job.findUniqueOrThrow({ where: { dedupeKey: `sap.post:${f.requestId}` } });
    expect(job.payload).toMatchObject({ postingId: f.postingId, trigger: 'MANUAL', force: true });
    expect(await t.prisma.auditLog.count({ where: { action: 'sap.posting.force_retry', entityType: 'SapPosting', entityId: f.postingId } })).toBe(1);
  });

  it('403 without sap.retry', async () => {
    const sup = await t.auth('supervisor');
    await t.http.post('/api/v1/sap/postings/x/retry').set(sup).send({ force: true }).expect(403);
  });

  it('posting detail includes attempts and the payload', async () => {
    const f = await failedPosting();
    const d = await t.http.get(`/api/v1/sap/postings/${f.postingId}`).set(admin).expect(200);
    expect(d.body.payload.reference).toBe(f.number);
    expect(d.body.attemptLogs.length).toBeGreaterThan(0);
    expect(d.body.attemptLogs[0]).toMatchObject({ attemptNo: 1, trigger: 'AUTO', success: false });
  });
});
