import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../helpers';

/** Independent copy of PLAN §12 (seed table) so a drifting seed or guard is caught. */
const ROLE_PERMS: Record<string, string[] | 'ALL'> = {
  admin: 'ALL',
  supervisor: ['requests.view', 'requests.act', 'masterdata.view', 'assignments.manage', 'vehicle_changes.view'],
  manager: ['requests.view', 'requests.view_all', 'requests.act', 'masterdata.view', 'assignments.manage', 'vehicle_changes.view', 'reports.view', 'dashboard.view'],
  engineer: ['requests.view', 'requests.act'],
  shipping: ['requests.view', 'requests.act', 'masterdata.view', 'assignments.manage', 'vehicle_changes.view', 'vehicle_changes.decide'],
  accountant1: ['requests.view', 'requests.view_all', 'requests.act', 'requests.edit_amounts', 'requests.reclassify', 'masterdata.view', 'reports.view', 'reports.export', 'reports.export_images', 'sap.view'],
  chief: ['requests.view', 'requests.view_all', 'requests.act', 'requests.edit_amounts', 'requests.reclassify', 'masterdata.view', 'reports.view', 'reports.export', 'reports.export_images', 'sap.view', 'masterdata.manage', 'sap.retry', 'dashboard.view', 'audit.view'],
  gm: ['requests.view', 'requests.view_all', 'requests.act', 'reports.view', 'reports.export', 'dashboard.view', 'audit.view'],
  treasury: ['requests.view', 'requests.view_all', 'requests.act', 'sap.view', 'reports.view'],
};

type Ep = [method: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string, perm: string | 'AUTH', body?: object];

const MASTER = ['departments', 'submitters', 'vehicle-types', 'cost-centers', 'gl-accounts', 'vehicles', 'treasuries', 'expense-types'];
const ENDPOINTS: Ep[] = [
  ['get', '/users', 'users.view'],
  ['get', '/users/x', 'users.view'],
  ['post', '/users', 'users.manage', {}],
  ['patch', '/users/x', 'users.manage', {}],
  ['put', '/users/x/roles', 'users.manage', { roleIds: [] }],
  ['post', '/users/x/reset-password', 'users.manage', {}],
  ['post', '/users/x/revoke-sessions', 'users.manage', {}],
  ['get', '/roles', 'users.view'],
  ['get', '/roles/x', 'users.view'],
  ['post', '/roles', 'roles.manage', {}],
  ['patch', '/roles/x', 'roles.manage', {}],
  ['get', '/roles/matrix', 'roles.manage'],
  ['put', '/roles/x/permissions', 'roles.manage', { codes: [] }],
  ['get', '/audit-logs', 'audit.view'],
  ['get', '/settings', 'settings.manage'],
  ['put', '/settings/nope.key', 'settings.manage', { value: 1 }],
  ['get', '/settings/public', 'AUTH'],
  ['get', '/notifications', 'AUTH'],
  ['get', '/notifications/unread-count', 'AUTH'],
  ['post', '/notifications/read-all', 'AUTH', {}],
  ['get', '/lookups/roles', 'AUTH'],
  ['get', '/delegations?mine=1', 'AUTH'],
  ['get', '/auth/me', 'AUTH'],
  ['get', '/auth/sessions', 'AUTH'],
  ['post', '/submitters/x/telegram-unlink', 'submitters.telegram_link', {}],
  ['post', '/submitters/x/telegram-link', 'submitters.telegram_link', {}],
  ['post', '/users/x/telegram-link', 'users.manage', {}],
  ['post', '/users/x/telegram-unlink', 'users.manage', {}],
  ['get', '/request-types/modules', 'AUTH'],
  ['put', '/request-types/x/line-categories/order', 'request_types.manage', { ids: ['a'] }],
  ['post', '/templates', 'templates.manage', {}],
  ['patch', '/templates/x', 'templates.manage', {}],
  ['get', '/assignments/current', 'masterdata.view'],
  ['get', '/assignments', 'masterdata.view'],
  ['post', '/assignments', 'assignments.manage', {}],
  ['post', '/assignments/x/close', 'assignments.manage', {}],
  ['get', '/vehicle-change-requests', 'vehicle_changes.view'],
  ['post', '/vehicle-change-requests/x/approve', 'vehicle_changes.decide', {}],
  ['post', '/vehicle-change-requests/x/reject', 'vehicle_changes.decide', {}],
  ...MASTER.flatMap((r): Ep[] => [
    ['get', `/${r}`, 'masterdata.view'],
    ['get', `/${r}/x`, 'masterdata.view'],
    ['get', `/${r}/export.xlsx`, 'masterdata.view'],
    ['post', `/${r}`, 'masterdata.manage', {}],
    ['patch', `/${r}/x`, 'masterdata.manage', {}],
    ['post', `/${r}/x/activate`, 'masterdata.manage', {}],
    ['post', `/${r}/x/deactivate`, 'masterdata.manage', {}],
    ['post', `/${r}/import?dryRun=1`, 'masterdata.manage', {}],
  ]),
];

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp('wp1-matrix');
});
afterAll(async () => {
  await t?.close();
});

describe('authorization matrix', () => {
  it('unauthenticated requests get 401 on every protected endpoint', async () => {
    for (const [m, path, , body] of ENDPOINTS) {
      const req = t.http[m](`/api/v1${path}`);
      const r = body ? await req.send(body) : await req;
      expect(r.status, `${m.toUpperCase()} ${path}`).toBe(401);
    }
  });

  it('a garbage bearer token is 401', async () => {
    const r = await t.http.get('/api/v1/users').set('Authorization', 'Bearer not.a.jwt');
    expect(r.status).toBe(401);
  });

  for (const [username, perms] of Object.entries(ROLE_PERMS)) {
    it(`role of ${username}: allowed exactly where it holds the permission`, async () => {
      const h = await t.auth(username);
      const bad: string[] = [];
      for (const [m, path, perm, body] of ENDPOINTS) {
        const req = t.http[m](`/api/v1${path}`).set(h);
        const r = body ? await req.send(body) : await req;
        const allowed = perm === 'AUTH' || perms === 'ALL' || perms.includes(perm);
        const denied = r.status === 403 || r.status === 401;
        if (allowed && denied) bad.push(`${username} should be ALLOWED ${m.toUpperCase()} ${path} (${perm}) got ${r.status}`);
        if (!allowed && r.status !== 403) bad.push(`${username} should be 403 on ${m.toUpperCase()} ${path} (${perm}) got ${r.status}`);
      }
      expect(bad).toEqual([]);
    });
  }

  it('the super user is not forbidden anywhere, even for an unknown permission-guarded route', async () => {
    const h = await t.auth('admin');
    expect((await t.http.get('/api/v1/audit-logs').set(h)).status).toBe(200);
    expect((await t.http.get('/api/v1/roles/matrix').set(h)).status).toBe(200);
  });
});
