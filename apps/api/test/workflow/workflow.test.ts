import 'reflect-metadata';
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { registerExpenseModule } from '@dms/core/expense';
import { submitRequest } from '@dms/core/engine';
import { createTestApp, type TestApp } from '../helpers';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
let t: TestApp;
const H: Record<string, { Authorization: string }> = {};

async function newRequest(cats: { code: string; amount: string }[]) {
  const d = await t.prisma.submitter.findUniqueOrThrow({ where: { code: 'DRV001' } });
  const lines = [];
  for (const c of cats) {
    const cat = await t.prisma.lineCategory.findFirstOrThrow({ where: { code: c.code } });
    const a = await t.prisma.attachment.create({
      data: { storageKey: `attachments/2026/01/${randomBytes(6).toString('hex')}.jpg`, mimeType: 'image/jpeg', sizeBytes: 1, sha256: randomBytes(16).toString('hex'), uploadedBySubmitterId: d.id },
    });
    lines.push({ categoryId: cat.id, amount: c.amount, attachmentIds: [a.id] });
  }
  return submitRequest(t.prisma, { requestTypeCode: 'DRIVER_EXPENSE', channel: 'TELEGRAM', submitterId: d.id, headerValues: { odometer: 10 }, lines }, { type: 'SUBMITTER', submitterId: d.id });
}
async function instance(requestId: string, stepKey: string) {
  return t.prisma.requestStepInstance.findUniqueOrThrow({ where: { requestId_stepKey: { requestId, stepKey } } });
}

beforeAll(async () => {
  t = await createTestApp('wp2-workflow');
  registerExpenseModule();
  for (const u of ['admin', 'supervisor', 'manager', 'engineer', 'shipping', 'accountant1', 'accountant2', 'chief', 'gm', 'treasury']) H[u] = await t.auth(u);
});
afterAll(async () => {
  await t?.close();
});

describe('authentication and authorization', () => {
  it('401 without a token on every area', async () => {
    for (const path of ['/api/v1/requests', '/api/v1/requests/queue', '/api/v1/request-types', '/api/v1/workflows', '/api/v1/templates']) {
      expect((await t.http.get(path)).status).toBe(401);
    }
  });

  it('403 for missing permission', async () => {
    // engineer: requests.view/act only
    expect((await t.http.get('/api/v1/workflows').set(H.engineer)).status).toBe(403);
    expect((await t.http.get('/api/v1/templates').set(H.engineer)).status).toBe(403);
    expect((await t.http.post('/api/v1/request-types').set(H.engineer).send({})).status).toBe(403);
    expect((await t.http.post('/api/v1/requests').set(H.engineer).send({})).status).toBe(403);
    expect((await t.http.patch('/api/v1/requests/x/lines/y').set(H.supervisor).send({})).status).toBe(403);
    // manager has requests.* but no workflows.manage / templates.manage
    expect((await t.http.post('/api/v1/workflows/x/versions').set(H.manager).send({})).status).toBe(403);
    expect((await t.http.post('/api/v1/workflow-versions/x/publish').set(H.manager)).status).toBe(403);
    expect((await t.http.post('/api/v1/template-versions/x/publish').set(H.manager)).status).toBe(403);
    // lock/approve need requests.act: auditor-like users without it are refused (gm has act; use a user stripped of perms)
    expect((await t.http.get('/api/v1/request-types').set(H.engineer)).status).toBe(200); // auth only
  });

  it('403 when the user lacks the role of the step; 404/403 on someone else\'s request', async () => {
    const r = await newRequest([{ code: 'TOLLS', amount: '10' }]);
    const inst = await instance(r.id, 'supervisor');
    const res = await t.http.post(`/api/v1/requests/${r.id}/steps/${inst.id}/approve`).set(H.manager).send({ checklist: { receipts_match: true } });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    // engineer has no step on a tolls-only request: cannot read it (IDOR)
    expect((await t.http.get(`/api/v1/requests/${r.id}`).set(H.engineer)).status).toBe(403);
    expect((await t.http.post(`/api/v1/requests/${r.id}/lock`).set(H.engineer)).status).toBe(403);
    expect((await t.http.get(`/api/v1/requests/${r.id}`).set(H.supervisor)).status).toBe(200);
    // editing amounts is refused to a supervisor (no permission) and to the wrong step
    const line = await t.prisma.requestLine.findFirstOrThrow({ where: { requestId: r.id } });
    expect((await t.http.patch(`/api/v1/requests/${r.id}/lines/${line.id}`).set(H.accountant1).send({ stepInstanceId: inst.id, amount: '1', reason: 'x' })).status).toBe(403);
  });

  it('validation errors use the error envelope', async () => {
    const r = await newRequest([{ code: 'TOLLS', amount: '10' }]);
    const inst = await instance(r.id, 'supervisor');
    const res = await t.http.post(`/api/v1/requests/${r.id}/steps/${inst.id}/send-back`).set(H.supervisor).send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION');
    const res2 = await t.http.post(`/api/v1/requests/${r.id}/steps/${inst.id}/approve`).set(H.supervisor).send({});
    expect(res2.status).toBe(400); // checklist required
  });
});

describe('request flow over HTTP', () => {
  it('queue, detail, lock, approve to PAID, SAP posting once', async () => {
    const r = await newRequest([{ code: 'TOLLS', amount: '100' }]);
    const q = await t.http.get('/api/v1/requests/queue').set(H.supervisor);
    expect(q.status).toBe(200);
    expect(q.body.items.some((i: { id: string }) => i.id === r.id)).toBe(true);
    const counters = await t.http.get('/api/v1/requests/queue/counters').set(H.supervisor);
    expect(counters.body[0].count).toBeGreaterThanOrEqual(1);
    const det = await t.http.get(`/api/v1/requests/${r.id}`).set(H.supervisor);
    expect(det.body.number).toBe(r.number);
    expect(det.body.myActions.approve).toBe(true);
    // lock conflict between two accountants
    const path: [string, string][] = [['supervisor', 'supervisor'], ['campaign_manager', 'manager']];
    for (const [key, who] of path) {
      const inst = await instance(r.id, key);
      const res = await t.http.post(`/api/v1/requests/${r.id}/steps/${inst.id}/approve`).set(H[who]).send({ checklist: { receipts_match: true } });
      expect(res.status).toBe(200);
    }
    const l1 = await t.http.post(`/api/v1/requests/${r.id}/lock`).set(H.accountant1);
    expect(l1.status).toBe(200);
    const l2 = await t.http.post(`/api/v1/requests/${r.id}/lock`).set(H.accountant2);
    expect(l2.status).toBe(409);
    expect(l2.body.error.code).toBe('LOCKED');
    expect((await t.http.post(`/api/v1/requests/${r.id}/lock/heartbeat`).set(H.accountant1)).status).toBe(200);
    const accInst = await instance(r.id, 'accountant');
    expect((await t.http.post(`/api/v1/requests/${r.id}/steps/${accInst.id}/approve`).set(H.accountant2).send({})).status).toBe(409);
    // accountant edits via PATCH
    const line = await t.prisma.requestLine.findFirstOrThrow({ where: { requestId: r.id } });
    const ed = await t.http.patch(`/api/v1/requests/${r.id}/lines/${line.id}`).set(H.accountant1).send({ stepInstanceId: accInst.id, amount: '90', reason: 'تعديل' });
    expect(ed.status).toBe(200);
    const det2 = await t.http.get(`/api/v1/requests/${r.id}`).set(H.accountant1);
    expect(det2.body.lines[0].originalAmount).toBe('100');
    expect(det2.body.lines[0].amount).toBe('90');
    expect(det2.body.lock.userName).toBeTruthy();
    expect((await t.http.delete(`/api/v1/requests/${r.id}/lock`).set(H.accountant2)).status).toBe(403);
    expect((await t.http.delete(`/api/v1/requests/${r.id}/lock?force=1`).set(H.accountant2)).status).toBe(403);
    expect((await t.http.delete(`/api/v1/requests/${r.id}/lock?force=1`).set(H.admin)).status).toBe(200);
    for (const [key, who] of [['accountant', 'accountant1'], ['chief_accountant', 'chief'], ['general_manager', 'gm']] as [string, string][]) {
      const inst = await instance(r.id, key);
      expect((await t.http.post(`/api/v1/requests/${r.id}/steps/${inst.id}/approve`).set(H[who]).send({})).status).toBe(200);
    }
    const tr = await t.prisma.treasury.findFirstOrThrow();
    const tInst = await instance(r.id, 'treasury');
    expect((await t.http.post(`/api/v1/requests/${r.id}/steps/${tInst.id}/approve`).set(H.treasury).send({ actionData: { treasuryId: tr.id } })).status).toBe(200);
    const done = await t.http.get(`/api/v1/requests/${r.id}`).set(H.treasury);
    expect(done.body.status).toBe('PAID');
    expect(done.body.module.sap.status).toBe('PENDING');
    expect(await t.prisma.sapPosting.count({ where: { requestId: r.id } })).toBe(1);
    const list = await t.http.get('/api/v1/requests?status=PAID').set(H.treasury);
    expect(list.body.items.some((i: { id: string }) => i.id === r.id)).toBe(true);
  });

  it('request correction and reject over HTTP', async () => {
    const r = await newRequest([{ code: 'TOLLS', amount: '100' }]);
    const inst = await instance(r.id, 'supervisor');
    const line = await t.prisma.requestLine.findFirstOrThrow({ where: { requestId: r.id } });
    const c = await t.http.post(`/api/v1/requests/${r.id}/steps/${inst.id}/request-correction`).set(H.supervisor).send({ items: [{ lineId: line.id, reasonCode: 'IMAGE_UNCLEAR', fixType: 'REUPLOAD', comment: 'غير واضحة' }] });
    expect(c.status).toBe(200);
    const aw = await t.http.get('/api/v1/requests/queue?tab=awaiting').set(H.supervisor);
    expect(aw.body.items.some((i: { id: string }) => i.id === r.id)).toBe(true);
    // reject needs an ACTIVE step: awaiting one is a conflict
    expect((await t.http.post(`/api/v1/requests/${r.id}/steps/${inst.id}/reject`).set(H.supervisor).send({ reason: 'x' })).status).toBe(409);
    const r2 = await newRequest([{ code: 'TOLLS', amount: '5' }]);
    const i2 = await instance(r2.id, 'supervisor');
    expect((await t.http.post(`/api/v1/requests/${r2.id}/steps/${i2.id}/reject`).set(H.supervisor).send({ reason: 'مرفوض' })).status).toBe(200);
    const d = await t.http.get(`/api/v1/requests/${r2.id}`).set(H.supervisor);
    expect(d.body.status).toBe('REJECTED');
  });

  it('web submission with an uploaded attachment', async () => {
    const png = PNG;
    const d = await t.prisma.submitter.findUniqueOrThrow({ where: { code: 'DRV002' } });
    const type = await t.prisma.requestType.findUniqueOrThrow({ where: { code: 'DRIVER_EXPENSE' } });
    expect((await t.http.patch(`/api/v1/request-types/${type.id}`).set(H.admin).send({ channels: ['TELEGRAM', 'WEB'] })).status).toBe(200);
    const up = await t.http.post('/api/v1/requests/attachments').set(H.admin).attach('file', png, 'r.png');
    expect(up.status).toBe(201);
    const cat = await t.prisma.lineCategory.findFirstOrThrow({ where: { code: 'TOLLS' } });
    const res = await t.http.post('/api/v1/requests').set(H.admin).send({
      requestTypeCode: 'DRIVER_EXPENSE',
      submitterId: d.id,
      headerValues: { odometer: 77 },
      lines: [{ categoryId: cat.id, amount: '12.5', attachmentIds: [up.body.attachmentId] }],
    });
    expect(res.status).toBe(201);
    expect(res.body.number).toMatch(/^DE-\d\d-\d{6}$/);
    const noFile = await t.http.post('/api/v1/requests/attachments').set(H.admin);
    expect(noFile.status).toBe(400);
  });
});

describe('request types, workflows, templates over HTTP', () => {
  it('request types list/detail/create/line categories', async () => {
    const list = await t.http.get('/api/v1/request-types').set(H.supervisor);
    expect(list.body.some((x: { code: string }) => x.code === 'DRIVER_EXPENSE')).toBe(true);
    const type = list.body.find((x: { code: string }) => x.code === 'DRIVER_EXPENSE');
    const det = await t.http.get(`/api/v1/request-types/${type.id}`).set(H.supervisor);
    expect(det.body.lineCategories.length).toBeGreaterThanOrEqual(8);
    const maint = det.body.lineCategories.find((c: { code: string }) => c.code === 'MAINTENANCE');
    expect(maint.approvalRoleIds).toHaveLength(1);
    const created = await t.http.post('/api/v1/request-types').set(H.admin).send({ code: 'HR_LEAVE', nameAr: 'إجازة', nameEn: 'Leave', numberPrefix: 'HL', hasLines: false });
    expect(created.status).toBe(201);
    expect(created.body.workflowId).toBeTruthy();
    const dup = await t.http.post('/api/v1/request-types').set(H.admin).send({ code: 'HR_LEAVE', nameAr: 'x', nameEn: 'x', numberPrefix: 'HM' });
    expect(dup.status).toBe(409);
    const cat = await t.http.post(`/api/v1/request-types/${created.body.id}/line-categories`).set(H.admin).send({ code: 'ANNUAL', nameAr: 'سنوية', nameEn: 'Annual' });
    expect(cat.status).toBe(201);
    const role = await t.prisma.role.findUniqueOrThrow({ where: { code: 'GENERAL_MANAGER' } });
    const up = await t.http.patch(`/api/v1/request-types/${created.body.id}/line-categories/${cat.body.id}`).set(H.admin).send({ approvalRoleIds: [role.id] });
    expect(up.body.approvalRoleIds).toEqual([role.id]);
    expect((await t.http.post(`/api/v1/request-types/${created.body.id}/line-categories`).set(H.supervisor).send({ code: 'X', nameAr: 'x', nameEn: 'x' })).status).toBe(403);
  });

  it('workflow versions: draft, edit, simulate, publish; in-flight request untouched', async () => {
    const wfs = await t.http.get('/api/v1/workflows').set(H.admin);
    const wf = wfs.body.find((w: { requestTypeCode: string }) => w.requestTypeCode === 'DRIVER_EXPENSE');
    const r = await newRequest([{ code: 'TOLLS', amount: '10' }]);
    const d = await t.http.get(`/api/v1/workflows/${wf.id}`).set(H.admin);
    const active = d.body.versions.find((v: { status: string }) => v.status === 'ACTIVE');
    const nv = await t.http.post(`/api/v1/workflows/${wf.id}/versions`).set(H.admin).send({});
    expect(nv.status).toBe(201);
    const full = await t.http.get(`/api/v1/workflow-versions/${nv.body.id}`).set(H.admin);
    expect(full.body.status).toBe('DRAFT');
    expect(full.body.steps).toHaveLength(9);
    const steps = full.body.steps.filter((s: { key: string }) => s.key !== 'general_manager');
    const put = await t.http.put(`/api/v1/workflow-versions/${nv.body.id}`).set(H.admin).send({ note: 'no GM', steps });
    expect(put.status).toBe(200);
    const sim = await t.http.post(`/api/v1/workflow-versions/${nv.body.id}/simulate`).set(H.admin).send({ categoryIds: [], totalAmount: '10' });
    expect(sim.body.find((s: { stepKey: string }) => s.stepKey === 'treasury').applies).toBe(true);
    // published versions are immutable
    expect((await t.http.put(`/api/v1/workflow-versions/${active.id}`).set(H.admin).send({ steps })).status).toBe(409);
    expect((await t.http.delete(`/api/v1/workflow-versions/${active.id}`).set(H.admin)).status).toBe(409);
    expect((await t.http.post(`/api/v1/workflow-versions/${nv.body.id}/publish`).set(H.admin)).status).toBe(200);
    const after = await t.http.get(`/api/v1/workflows/${wf.id}`).set(H.admin);
    expect(after.body.versions.filter((v: { status: string }) => v.status === 'ACTIVE')).toHaveLength(1);
    const detail = await t.http.get(`/api/v1/requests/${r.id}`).set(H.admin);
    expect(detail.body.steps.some((s: { stepKey: string }) => s.stepKey === 'general_manager')).toBe(true);
    const nr = await newRequest([{ code: 'TOLLS', amount: '10' }]);
    const nd = await t.http.get(`/api/v1/requests/${nr.id}`).set(H.admin);
    expect(nd.body.steps.some((s: { stepKey: string }) => s.stepKey === 'general_manager')).toBe(false);
    // draft deletion
    const dv = await t.http.post(`/api/v1/workflows/${wf.id}/versions`).set(H.admin).send({});
    expect((await t.http.delete(`/api/v1/workflow-versions/${dv.body.id}`).set(H.admin)).status).toBe(200);
  });

  it('templates: list, draft, edit, publish, logo upload', async () => {
    const list = await t.http.get('/api/v1/templates').set(H.admin);
    expect(list.body.length).toBeGreaterThanOrEqual(1);
    const tpl = await t.http.get(`/api/v1/templates/${list.body[0].id}`).set(H.admin);
    const active = tpl.body.versions.find((v: { status: string }) => v.status === 'ACTIVE');
    const nv = await t.http.post(`/api/v1/templates/${tpl.body.id}/versions`).set(H.admin);
    expect(nv.status).toBe(201);
    expect((await t.http.post(`/api/v1/templates/${tpl.body.id}/versions`).set(H.admin)).status).toBe(409);
    const cfg = { ...nv.body.config, titleAr: 'كشف مصاريف معدل' };
    const put = await t.http.put(`/api/v1/template-versions/${nv.body.id}`).set(H.admin).send({ config: cfg });
    expect(put.body.config.titleAr).toBe('كشف مصاريف معدل');
    expect((await t.http.put(`/api/v1/template-versions/${nv.body.id}`).set(H.admin).send({ config: { titleAr: 1 } })).status).toBe(400);
    expect((await t.http.put(`/api/v1/template-versions/${active.id}`).set(H.admin).send({ config: cfg })).status).toBe(409);
    expect((await t.http.post(`/api/v1/template-versions/${nv.body.id}/publish`).set(H.admin)).status).toBe(200);
    const after = await t.http.get(`/api/v1/templates/${tpl.body.id}`).set(H.admin);
    expect(after.body.versions.filter((v: { status: string }) => v.status === 'ACTIVE')).toHaveLength(1);
    const png = PNG;
    const logo = await t.http.post('/api/v1/templates/logo').set(H.admin).attach('file', png, 'l.png');
    expect(logo.status).toBe(201);
    expect(logo.body.key).toMatch(/^logos\//);
    const bad = await t.http.post('/api/v1/templates/logo').set(H.admin).attach('file', Buffer.from('MZ not an image'), 'l.png');
    expect(bad.status).toBe(400);
  });
});
