import { expect, test, type Page } from '@playwright/test';
import { Api, submitSimpleRequest, type Any } from '../support/flow';
import { bad, chooseFirst, fillEmptyTextboxes, login, openPage, watch } from '../support/ui';

// Redesign checks (DESIGN_SPEC sections 8-9). Test ids and roles only.
// Cut features (command palette, workflow route preview card, audit diff viewer, roles-matrix mobile accordion,
// density / Arabic-Indic numerals toggle UI) are deliberately not asserted here.

test.describe.configure({ mode: 'serial' });

async function firstQueueRequest(): Promise<{ id: string; number: string }> {
  await submitSimpleRequest('DRV005');
  const sup = await new Api('supervisor').login();
  const item = ((await sup.get('/requests/queue?pageSize=5')).items as Any[])[0];
  expect(item, 'supervisor queue is empty').toBeTruthy();
  return { id: item.id as string, number: item.number as string };
}

async function noHorizontalOverflow(page: Page, label: string) {
  const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  expect(o.sw, `${label} overflows horizontally`).toBeLessThanOrEqual(o.iw + 1);
}

test.describe('desktop', () => {
  test('theme toggle switches to dark and survives a reload', async ({ page }) => {
    watch(page, () => 'theme');
    await login(page, 'admin');
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark');
    await page.getByTestId('topbar-theme').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.getByTestId('topbar-theme').click(); // back to light
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });

  test('language toggle switches to LTR English and survives a reload', async ({ page }) => {
    watch(page, () => 'locale');
    await login(page, 'admin');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await page.getByTestId('topbar-locale').click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await page.getByTestId('topbar-locale').click(); // back to Arabic
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  });

  test('request numbers stay Latin identifiers', async ({ page }) => {
    watch(page, () => 'number');
    const r = await firstQueueRequest();
    await login(page, 'supervisor');
    await openPage(page, `/requests/${r.id}`, 'page-request-detail');
    await expect(page.getByTestId('request-number')).toHaveText(/^[A-Z]+-\d{2}-\d{6}$/);
    await expect(page.getByTestId('request-total')).toBeVisible();
  });

  test('request type: create, add a field and a category', async ({ page }) => {
    watch(page, () => 'request type');
    const digits = String(Date.now()).slice(-8);
    const code = `E2E${digits}`;
    const letters = () => String.fromCharCode(65 + Math.floor(Math.random() * 26));
    const prefix = `${letters()}${letters()}`;
    await login(page, 'admin');
    await openPage(page, '/admin/request-types', 'page-admin-request-types');
    await page.getByTestId('rt-new').click();
    await expect(page.getByTestId('page-request-type-editor')).toBeVisible();
    await page.getByTestId('rt-code').fill(code);
    await page.getByTestId('rt-prefix').fill(prefix);
    await page.getByTestId('rt-name-ar').fill(`نوع اختبار ${digits}`);
    await page.getByTestId('rt-name-en').fill(`E2E type ${digits}`);
    await page.getByTestId('tab-fields').click();
    await page.getByTestId('rt-add-field').click();
    await page.getByTestId('rt-field-0-key').fill('note');
    await page.getByTestId('rt-save').click();
    await page.waitForURL((u) => /\/admin\/request-types\/(?!new)[^/]+$/.test(u.pathname), { timeout: 20000 });
    await page.getByTestId('tab-categories').click();
    await page.getByTestId('rt-add-category').click();
    const form = page.getByTestId('rt-cat-form');
    await expect(form).toBeVisible();
    await page.getByTestId('rt-cat-code').fill(`CAT${digits}`);
    await fillEmptyTextboxes(form, `فئة ${digits}`);
    await page.getByTestId('rt-cat-save').click();
    await expect(page.getByTestId('rt-cat-row').first()).toBeVisible({ timeout: 15000 });
    await openPage(page, '/admin/request-types', 'page-admin-request-types');
    await expect(page.locator(`[data-testid="rt-row"][data-code="${code}"]`)).toBeVisible();
  });

  test('template: create from the dialog and open the editor', async ({ page }) => {
    watch(page, () => 'template');
    const digits = String(Date.now()).slice(-8);
    await login(page, 'admin');
    await openPage(page, '/templates', 'page-templates');
    await page.getByTestId('template-new').click();
    await expect(page.getByTestId('template-create-dialog')).toBeVisible();
    await chooseFirst(page.getByTestId('tpl-type'));
    await page.getByTestId('tpl-code').fill(`TPL${digits}`);
    await page.getByTestId('tpl-name-ar').fill(`قالب ${digits}`);
    await page.getByTestId('tpl-name-en').fill(`Template ${digits}`);
    await page.getByTestId('tpl-create-submit').click();
    await page.waitForURL((u) => /\/templates\/[^/]+$/.test(u.pathname), { timeout: 20000 });
    await expect(page.getByTestId('page-template-editor')).toBeVisible();
  });

  test('roles matrix: a change shows the unsaved bar and discard clears it', async ({ page }) => {
    watch(page, () => 'roles');
    await login(page, 'admin');
    await openPage(page, '/admin/roles', 'page-admin-roles');
    await expect(page.getByTestId('matrix')).toBeVisible();
    await expect(page.getByTestId('matrix-dirty-count')).toHaveCount(0);
    await page.getByTestId('matrix-cell').nth(1).click();
    await expect(page.getByTestId('matrix-dirty-count')).toBeVisible();
    await expect(page.getByTestId('matrix-save')).toBeVisible();
    await page.getByTestId('matrix-discard').click();
    await expect(page.getByTestId('matrix-dirty-count')).toHaveCount(0);
  });

  test('user Telegram link dialog shows a /start command', async ({ page }) => {
    watch(page, () => 'telegram');
    await login(page, 'admin');
    await openPage(page, '/profile', 'page-profile');
    await page.getByTestId('profile-tg-link').click();
    await expect(page.getByTestId('tg-link-dialog')).toBeVisible();
    await expect(page.getByTestId('tg-link-command')).toHaveText(/^\/start u_/);
  });

  test('SAP monitor: the drawer opens for a posting and a FAILED one offers retry', async ({ page }) => {
    watch(page, () => 'sap');
    await login(page, 'admin');
    await openPage(page, '/sap', 'page-sap');
    await expect(page.getByTestId('sap-row').first()).toBeVisible();
    await page.getByTestId('sap-row').first().click();
    await expect(page.getByTestId('sap-drawer')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByTestId('sap-counter-FAILED').click();
    await expect(page.getByTestId('sap-row').first()).toBeVisible();
    await page.getByTestId('sap-row').first().click();
    await expect(page.getByTestId('sap-retry')).toBeVisible();
  });

  test('sidebar shows the inbox badge for the supervisor', async ({ page }) => {
    watch(page, () => 'badge');
    await submitSimpleRequest('DRV005');
    await login(page, 'supervisor');
    await openPage(page, '/inbox', 'page-inbox');
    const badge = page.getByTestId('nav-badge-inbox');
    await expect(badge).toBeVisible();
    expect(Number((await badge.innerText()).replace(/\D/g, ''))).toBeGreaterThan(0);
  });
});

test.describe('mobile', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('mobile: tab bar on the inbox, action bar on the request', async ({ page }) => {
    watch(page, () => 'mobile');
    const before = bad.length;
    const r = await firstQueueRequest();
    await login(page, 'supervisor');
    await openPage(page, '/inbox', 'page-inbox');
    await expect(page.getByTestId('mobile-tabbar')).toBeVisible();
    await openPage(page, `/requests/${r.id}`, 'page-request-detail');
    await expect(page.getByTestId('mobile-tabbar')).toBeHidden();
    await expect(page.getByTestId('action-bar')).toBeVisible();
    // the primary button claims the lock first when it is not held, then opens the dialog
    await page.getByTestId('action-approve').click();
    const dialog = page.getByTestId('approve-dialog');
    await expect(dialog).toBeVisible({ timeout: 15000 });
    await dialog.locator('[data-testid^="approve-check-"]').first().click();
    await page.getByTestId('approve-confirm').click();
    await expect(page.getByTestId('seal')).toBeVisible();
    expect(bad.slice(before)).toEqual([]);
  });

  test('mobile: no horizontal overflow', async ({ page }) => {
    watch(page, () => 'overflow');
    const r = await firstQueueRequest();
    await login(page, 'admin');
    for (const [path, id] of [
      ['/inbox', 'page-inbox'],
      ['/requests', 'page-requests'],
      ['/dashboard', 'page-dashboard'],
      [`/requests/${r.id}`, 'page-request-detail'],
      ['/admin/roles', 'page-admin-roles'],
    ] as const) {
      await openPage(page, path, id);
      await noHorizontalOverflow(page, path);
    }
  });
});
