import { expect, test, type Page } from '@playwright/test';
import { Api, PASSWORD, submitSimpleRequest, type Any } from '../support/flow';

// Real browser pass over the running web app (needs api, web, worker, driver simulator and the demo/base seed).
const bad: string[] = [];

function watch(page: Page, label: () => string) {
  page.on('pageerror', (e) => bad.push(`[pageerror] ${label()}: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/favicon|Failed to load resource: the server responded with a status of 40[134]/.test(m.text())) bad.push(`[console] ${label()}: ${m.text().slice(0, 200)}`);
  });
  page.on('response', (r) => {
    const u = r.url();
    if (r.status() >= 400 && !u.endsWith('/auth/refresh') && !u.includes('favicon')) bad.push(`[${r.status()}] ${label()}: ${r.request().method()} ${u}`);
  });
}

async function login(page: Page, username: string) {
  await page.goto('/login');
  await page.locator('input').first().fill(username);
  await page.locator('input[type=password]').fill(PASSWORD);
  await page.locator('button[type=submit]').click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20000 });
}

const ADMIN_PAGES = [
  '/inbox', '/requests', '/dashboard', '/reports', '/sap', '/templates', '/workflows', '/vehicle-changes', '/assignments', '/notifications', '/profile',
  '/master/cost-centers', '/master/drivers', '/master/expense-types', '/master/gl-accounts', '/master/sap-settings', '/master/treasuries', '/master/vehicle-types', '/master/vehicles',
  '/admin/audit', '/admin/delegations', '/admin/departments', '/admin/roles', '/admin/settings', '/admin/users',
];

test.describe.configure({ mode: 'serial' });

test('admin: every screen renders in RTL without runtime errors or 4xx/5xx', async ({ page }) => {
  let cur = 'login';
  watch(page, () => cur);
  await login(page, 'admin');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  for (const p of ADMIN_PAGES) {
    cur = p;
    await page.goto(p);
    await page.waitForLoadState('networkidle');
    const text = (await page.locator('body').innerText()).trim();
    expect(text.length, `${p} is blank`).toBeGreaterThan(30);
    expect(text, `${p} shows an error boundary`).not.toMatch(/Application error|Something went wrong|Unhandled Runtime Error/);
  }
  expect(bad).toEqual([]);
});

test('supervisor: inbox -> request detail with gallery and action panel -> approve in the browser', async ({ page }) => {
  let cur = 'login';
  const before = bad.length;
  watch(page, () => cur);
  // a fresh request so the supervisor has something to approve
  const admin = await new Api('admin').login();
  await submitSimpleRequest('DRV005');
  void admin;
  await login(page, 'supervisor');
  cur = 'inbox';
  await page.goto('/inbox');
  await page.waitForLoadState('networkidle');
  expect((await page.locator('body').innerText()).length).toBeGreaterThan(30);
  const sup = await new Api('supervisor').login();
  const q = await sup.get('/requests/queue?pageSize=5');
  const item = (q.items as Any[])[0];
  expect(item, 'supervisor queue is empty').toBeTruthy();
  cur = `request ${item.number}`;
  await page.goto(`/requests/${item.id}`);
  await page.waitForLoadState('networkidle');
  await expect(page.getByText(item.number).first()).toBeVisible();
  expect(await page.locator('img').count(), 'gallery images').toBeGreaterThan(0);
  const approve = page.getByRole('button', { name: /اعتماد|موافقة|Approve/ }).first();
  await expect(approve).toBeVisible();
  await page.screenshot({ path: 'test-results/request-detail.png', fullPage: true });
  // act in the browser: take the lock, tick the receipts checkbox, approve
  await page.getByRole('button', { name: /استلام الطلب/ }).click();
  await approve.click();
  const box = page.getByRole('checkbox').first();
  await expect(box).toBeVisible();
  await box.check();
  await page.getByRole('dialog').getByRole('button', { name: /موافقة|اعتماد|تأكيد/ }).last().click();
  await expect.poll(async () => (await sup.get(`/requests/${item.id}`)).steps.find((x: Any) => x.stepKey === 'supervisor').status, { timeout: 15000 }).toBe('APPROVED');
  expect(bad.slice(before)).toEqual([]);
});

test('admin: workflow builder, template editor and report export open and work', async ({ page }) => {
  let cur = 'login';
  const before = bad.length;
  watch(page, () => cur);
  await login(page, 'admin');
  const admin = await new Api('admin').login();
  const wfs = await admin.get('/workflows');
  cur = 'workflow editor';
  await page.goto(`/workflows/${wfs[0].id}`);
  await page.waitForLoadState('networkidle');
  expect((await page.locator('body').innerText()).length).toBeGreaterThan(100);
  const tpls = await admin.get('/templates');
  cur = 'template editor';
  await page.goto(`/templates/${tpls[0].id}`);
  await page.waitForLoadState('networkidle');
  expect((await page.locator('body').innerText()).length).toBeGreaterThan(100);
  await page.screenshot({ path: 'test-results/template-editor.png' });
  cur = 'reports';
  await page.goto('/reports');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: /تصدير|Excel|إكسل/ }).first().click();
  await expect.poll(async () => ((await admin.get('/reports/exports')) as Any).items?.length ?? ((await admin.get('/reports/exports')) as Any).length, { timeout: 20000 }).toBeGreaterThan(0);
  expect(bad.slice(before)).toEqual([]);
});
