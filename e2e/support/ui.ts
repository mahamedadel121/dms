import { expect, type Locator, type Page } from '@playwright/test';
import { PASSWORD } from './flow';

/** Collected browser problems (runtime errors, console errors, 4xx/5xx). Shared by the specs of one worker. */
export const bad: string[] = [];

export function watch(page: Page, label: () => string) {
  page.on('pageerror', (e) => bad.push(`[pageerror] ${label()}: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/favicon|Failed to load resource: the server responded with a status of 40[134]/.test(m.text())) bad.push(`[console] ${label()}: ${m.text().slice(0, 200)}`);
  });
  page.on('response', (r) => {
    const u = r.url();
    if (r.status() >= 400 && !u.endsWith('/auth/refresh') && !u.includes('favicon')) bad.push(`[${r.status()}] ${label()}: ${r.request().method()} ${u}`);
  });
}

export async function login(page: Page, username: string) {
  await page.goto('/login');
  await page.getByTestId('login-username').fill(username);
  await page.getByTestId('login-password').fill(PASSWORD);
  await page.getByTestId('login-submit').click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20000 });
}

export interface AdminPage {
  path: string;
  testId: string;
}

export const ADMIN_PAGES: AdminPage[] = [
  { path: '/inbox', testId: 'page-inbox' },
  { path: '/requests', testId: 'page-requests' },
  { path: '/dashboard', testId: 'page-dashboard' },
  { path: '/reports', testId: 'page-reports' },
  { path: '/sap', testId: 'page-sap' },
  { path: '/templates', testId: 'page-templates' },
  { path: '/workflows', testId: 'page-workflows' },
  { path: '/vehicle-changes', testId: 'page-vehicle-changes' },
  { path: '/assignments', testId: 'page-assignments' },
  { path: '/notifications', testId: 'page-notifications' },
  { path: '/profile', testId: 'page-profile' },
  { path: '/master/cost-centers', testId: 'page-master-cost-centers' },
  { path: '/master/drivers', testId: 'page-master-drivers' },
  { path: '/master/expense-types', testId: 'page-master-expense-types' },
  { path: '/master/gl-accounts', testId: 'page-master-gl-accounts' },
  { path: '/master/sap-settings', testId: 'page-master-sap-settings' },
  { path: '/master/treasuries', testId: 'page-master-treasuries' },
  { path: '/master/vehicle-types', testId: 'page-master-vehicle-types' },
  { path: '/master/vehicles', testId: 'page-master-vehicles' },
  { path: '/admin/audit', testId: 'page-admin-audit' },
  { path: '/admin/delegations', testId: 'page-admin-delegations' },
  { path: '/admin/departments', testId: 'page-admin-departments' },
  { path: '/admin/roles', testId: 'page-admin-roles' },
  { path: '/admin/settings', testId: 'page-admin-settings' },
  { path: '/admin/users', testId: 'page-admin-users' },
  { path: '/admin/request-types', testId: 'page-admin-request-types' },
];

/** goto + networkidle + the page root test id must be visible. */
export async function openPage(page: Page, path: string, testId?: string) {
  await page.goto(path);
  await page.waitForLoadState('networkidle');
  const id = testId ?? ADMIN_PAGES.find((p) => p.path === path)?.testId;
  if (id) await expect(page.getByTestId(id), `${path} root ${id}`).toBeVisible();
}

/** Picks the first real option of a native select or a custom (Radix-style) select trigger. */
export async function chooseFirst(trigger: Locator) {
  const tag = await trigger.evaluate((el) => el.tagName.toLowerCase());
  if (tag === 'select') {
    await trigger.selectOption({ index: 1 });
    return;
  }
  await trigger.click();
  await trigger.page().getByRole('option').first().click();
}

/** Fills every empty visible text box inside a container (used where only some inputs have documented test ids). */
export async function fillEmptyTextboxes(root: Locator, value: string) {
  const boxes = root.getByRole('textbox');
  const n = await boxes.count();
  for (let i = 0; i < n; i++) {
    const b = boxes.nth(i);
    if ((await b.isVisible()) && (await b.isEditable()) && (await b.inputValue()) === '') await b.fill(value);
  }
}
