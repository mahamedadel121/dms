import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createPrisma } from '@dms/db';
import { API, Api, poll, SIM, SimDriver, type Any } from '../support/flow';

// Full vertical slice against the REAL running stack (api :4000, worker, driver simulator :3010).
// Driver (simulator) submits maintenance + tips + diesel -> every approver acts over the REST API -> PAID -> final PDF + SAP.
test.describe.configure({ mode: 'serial' });

const state: { number?: string; id?: string } = {};
const drv = new SimDriver('DRV003');

test('driver submits a 3-line request through the bot simulator', async () => {
  await drv.reset();
  await drv.text('/start');
  await drv.contact();
  await drv.click('طلب جديد');
  await drv.click('أيوه');
  await drv.odometer('150000');
  await drv.addLine('صيانة', '1500');
  await drv.click('إضافة مصروف تاني');
  await drv.addLine('إكراميات', '100');
  await drv.click('إضافة مصروف تاني');
  await drv.click('سولار');
  await drv.text('500');
  await drv.text('20');
  await drv.photo();
  await drv.click('خلصت صور');
  await drv.click('كده خلصت');
  await drv.click('تأكيد وإرسال');
  const m = /DE-\d{2}-\d{6}/.exec(await drv.lastText());
  expect(m, await drv.lastText()).toBeTruthy();
  state.number = m![0];
});

test('approvers walk the request to PAID (receipts checkbox, parallel steps, accountant edit, treasury)', async () => {
  const users: Record<string, Api> = {};
  for (const u of ['supervisor', 'manager', 'engineer', 'shipping', 'accountant1', 'chief', 'gm', 'treasury', 'admin']) users[u] = await new Api(u).login();
  const admin = users.admin!;
  const list = await admin.get(`/requests?number=${state.number}`);
  state.id = list.items[0].id;
  let edited = false;
  const acted: string[] = [];
  for (let round = 0; round < 12; round++) {
    const d = await admin.get(`/requests/${state.id}`);
    if (d.status === 'PAID') break;
    for (const name of ['supervisor', 'engineer', 'shipping', 'manager', 'accountant1', 'chief', 'gm', 'treasury']) {
      const u = users[name]!;
      const q = await u.get(`/requests/queue?pageSize=200&number=${state.number}`);
      if (!(q.items as Any[]).some((r) => r.number === state.number)) continue;
      const det = await u.get(`/requests/${state.id}`);
      const my = det.myActions;
      if (!my?.approve) continue;
      await u.post(`/requests/${state.id}/lock`);
      if (name === 'accountant1' && !edited) {
        const line = det.lines.find((l: Any) => l.amount === '100.00') ?? det.lines[1];
        await u.patch(`/requests/${state.id}/lines/${line.id}`, { stepInstanceId: my.stepInstanceId, amount: '90', reason: 'e2e: receipt shows 90' });
        edited = true;
      }
      const checklist: Record<string, boolean> = {};
      for (const c of my.checklist ?? []) checklist[c.key] = true;
      await u.post(`/requests/${state.id}/steps/${my.stepInstanceId}/approve`, { comment: 'e2e ok', checklist });
      acted.push(name);
    }
  }
  expect(acted).toEqual(expect.arrayContaining(['supervisor', 'engineer', 'shipping', 'manager', 'accountant1', 'chief', 'gm', 'treasury']));
  expect(edited).toBe(true);
  const fin = await admin.get(`/requests/${state.id}`);
  expect(fin.status).toBe('PAID');
  expect(Number(fin.totals.original)).toBe(2100);
  expect(Number(fin.totals.final)).toBe(2090);
});

test('final PDF locked, SAP POSTED via mock adapter', async () => {
  const admin = await new Api('admin').login();
  const detail = await poll(async () => {
    const d = await admin.get(`/requests/${state.id}`);
    return d.finalPdf && d.module?.sap?.status === 'POSTED' ? d : false;
  }, 'finalPdf + SAP POSTED', 90000);
  expect(detail.finalPdf.sha256).toMatch(/^[0-9a-f]{64}$/);
  const url: string = detail.finalPdf.url;
  const res = await fetch(url.startsWith('http') ? url : `http://localhost:4000${url}`, { headers: { authorization: `Bearer ${admin.token}` } });
  expect(res.status).toBe(200);
  const buf = Buffer.from(await res.arrayBuffer());
  expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
  mkdirSync('test-results', { recursive: true });
  writeFileSync('test-results/final.pdf', buf);

  // document content: Arabic title and exactly the applicable signature blocks (driver + 8 approvers for this request)
  const tpls = await admin.get('/templates');
  const tpl = await admin.get(`/templates/${tpls[0].id}`);
  const pr = await fetch(`${API}/template-versions/${tpl.versions[0].id}/preview?format=html`, {
    method: 'POST',
    headers: { authorization: `Bearer ${admin.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ requestId: state.id }),
  });
  const html = await pr.text();
  expect(html).toContain('كشف مصاريف');
  expect(html).toContain(state.number!);
  for (const role of ['مشرف الحملة', 'مهندس الصيانة', 'مسؤول الشحن', 'مدير الحملة', 'محاسب', 'رئيس الحسابات', 'المدير العام', 'الخزينة']) expect(html).toContain(role);

  const sap = await admin.get(`/sap/postings?number=${state.number}`);
  expect(sap.items[0].status).toBe('POSTED');
  expect(sap.items[0].adapter).toBe('mock');
});

test('driver got Telegram notifications (queued in the outbox)', async () => {
  const prisma = createPrisma();
  try {
    const n = await prisma.notification.count({ where: { channel: 'TELEGRAM', recipientSubmitter: { code: 'DRV003' } } });
    expect(n).toBeGreaterThan(0);
  } finally {
    await prisma.$disconnect();
  }
});

test('correction round trip: supervisor asks for a new photo, driver fixes it in the bot, step returns to the supervisor', async () => {
  const d2 = new SimDriver('DRV004');
  await d2.reset();
  await d2.text('/start');
  await d2.contact();
  await d2.click('طلب جديد');
  await d2.click('أيوه');
  await d2.odometer('88000');
  await d2.addLine('رسوم طرق', '100');
  await d2.click('كده خلصت');
  await d2.click('تأكيد وإرسال');
  const number = /DE-\d{2}-\d{6}/.exec(await d2.lastText())![0];
  const sup = await new Api('supervisor').login();
  const id = (await sup.get(`/requests?number=${number}`)).items[0].id as string;
  const det = await sup.get(`/requests/${id}`);
  await sup.post(`/requests/${id}/lock`);
  await sup.post(`/requests/${id}/steps/${det.myActions.stepInstanceId}/request-correction`, {
    items: [{ lineId: det.lines[0].id, reasonCode: 'IMAGE_UNCLEAR', fixType: 'REUPLOAD', comment: 'الصورة مش واضحة' }],
  });
  expect((await sup.get(`/requests/${id}`)).status).toBe('CORRECTION_REQUESTED');
  // the notification reaches the simulated driver with a correction button
  const btn = await poll(async () => {
    const l = await d2.log();
    for (const e of [...l.entries].reverse()) for (const row of e.inline ?? []) for (const b of row) if (String(b.data).startsWith('corr:')) return { msgId: e.id as number, data: b.data as string };
    return false;
  }, 'correction notification button', 20000);
  expect(btn.data).toMatch(/^corr:/);
  await fetch(`${SIM}/api/send?driver=DRV004`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'click', msgId: btn.msgId, data: btn.data }) });
  await d2.photo();
  await d2.click('خلصت وابعت');
  const after = await poll(async () => {
    const x = await sup.get(`/requests/${id}`);
    return x.status === 'IN_REVIEW' ? x : false;
  }, 'request back in review', 15000);
  expect(after.corrections.every((c: Any) => c.status === 'RESOLVED')).toBe(true);
  expect(after.myActions?.approve).toBe(true);
  expect(after.lines[0].attachments.filter((a: Any) => a.isCurrent)).toHaveLength(1);
});
