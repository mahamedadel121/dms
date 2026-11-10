import { expect, test } from '@playwright/test';
import { Api, submitSimpleRequest, type Any } from '../support/flow';
import { ADMIN_PAGES, bad, login, openPage, watch } from '../support/ui';

// Real browser pass over the running web app (needs api, web, worker, driver simulator and the demo/base seed).
// Selects only by documented test ids (DESIGN_SPEC section 10) and roles.

test.describe.configure({ mode: 'serial' });

test('admin: every screen renders in RTL without runtime errors or 4xx/5xx', async ({ page }) => {
  let cur = 'login';
  watch(page, () => cur);
  await login(page, 'admin');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  for (const p of ADMIN_PAGES) {
    cur = p.path;
    await openPage(page, p.path, p.testId);
    const title = (await page.getByTestId('page-title').first().innerText()).trim();
    expect(title.length, `${p.path} has an empty page-title`).toBeGreaterThan(0);
    const text = (await page.locator('body').innerText()).trim();
    expect(text, `${p.path} shows an error boundary`).not.toMatch(/Application error|Something went wrong|Unhandled Runtime Error/);
    await expect(page.getByTestId('error-block'), `${p.path} shows an error block`).toHaveCount(0);
  }
  expect(bad).toEqual([]);
});

test('supervisor: inbox -> request detail -> approve in the browser', async ({ page }) => {
  let cur = 'login';
  const before = bad.length;
  watch(page, () => cur);
  // a fresh request so the supervisor has something to approve
  await submitSimpleRequest('DRV005');
  await login(page, 'supervisor');
  cur = 'inbox';
  await openPage(page, '/inbox', 'page-inbox');
  await expect(page.getByTestId('inbox-row').first()).toBeVisible();
  const sup = await new Api('supervisor').login();
  const q = await sup.get('/requests/queue?pageSize=5');
  const item = (q.items as Any[])[0];
  expect(item, 'supervisor queue is empty').toBeTruthy();
  cur = `request ${item.number}`;
  await openPage(page, `/requests/${item.id}`, 'page-request-detail');
  await expect(page.getByTestId('request-number')).toContainText(item.number);
  await expect(page.getByTestId('evidence-viewer').locator('img').first()).toBeVisible();
  await page.screenshot({ path: 'test-results/request-detail.png', fullPage: true });
  // act in the browser: take the lock, tick the first checklist item, approve
  await page.getByTestId('action-claim').click();
  await page.getByTestId('action-approve').click();
  const dialog = page.getByTestId('approve-dialog');
  await expect(dialog).toBeVisible();
  await dialog.locator('[data-testid^="approve-check-"]').first().click();
  await page.getByTestId('approve-confirm').click();
  await expect(page.getByTestId('seal')).toBeVisible();
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
  await openPage(page, `/workflows/${wfs[0].id}`, 'page-workflow-editor');
  expect(await page.getByTestId('wf-step').count(), 'workflow steps').toBeGreaterThan(0);
  const tpls = await admin.get('/templates');
  cur = 'template editor';
  await openPage(page, `/templates/${tpls[0].id}`, 'page-template-editor');
  await expect(page.getByTestId('tpl-preview-frame')).toBeVisible();
  await page.screenshot({ path: 'test-results/template-editor.png' });
  cur = 'reports';
  await openPage(page, '/reports', 'page-reports');
  await page.getByTestId('report-export').click();
  await page.getByTestId('report-export-EXCEL').click();
  await expect(page.getByTestId('export-row').first()).toBeVisible({ timeout: 20000 });
  expect(bad.slice(before)).toEqual([]);
});
