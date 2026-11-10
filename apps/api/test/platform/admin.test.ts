import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../helpers';

let t: TestApp;
let admin: { Authorization: string };
const api = (p: string) => `/api/v1${p}`;

beforeAll(async () => {
  t = await createTestApp('wp1-admin');
  admin = await t.auth('admin');
});
afterAll(async () => {
  await t?.close();
});

const uid = async (username: string) => (await t.prisma.user.findUniqueOrThrow({ where: { username } })).id;
const rid = async (code: string) => (await t.prisma.role.findUniqueOrThrow({ where: { code } })).id;

describe('users', () => {
  it('creates a user with roles, who can then log in; audit has after snapshot without password hash', async () => {
    const roleId = await rid('ACCOUNTANT');
    const r = await t.http
      .post(api('/users'))
      .set(admin)
      .send({ username: 'newbie', password: 'Str0ngPass!', fullName: 'New Bie', roleIds: [roleId] });
    expect(r.status).toBe(201);
    expect(r.body.roleIds).toEqual([roleId]);
    expect(JSON.stringify(r.body)).not.toContain('passwordHash');
    const login = await t.http.post(api('/auth/login')).send({ username: 'newbie', password: 'Str0ngPass!' });
    expect(login.status).toBe(200);
    expect(login.body.user.permissions).toContain('requests.edit_amounts');
    const audit = await t.prisma.auditLog.findFirstOrThrow({ where: { action: 'user.create', entityId: r.body.id } });
    expect(audit.after).toMatchObject({ username: 'newbie' });
    expect(JSON.stringify(audit.after)).not.toMatch(/argon2|passwordHash/);
  });

  it('duplicate username is 409; invalid body is 400 with the error envelope', async () => {
    const dup = await t.http.post(api('/users')).set(admin).send({ username: 'admin', password: 'Str0ngPass!', fullName: 'x' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('CONFLICT');
    const bad = await t.http.post(api('/users')).set(admin).send({ username: 'a' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('VALIDATION');
  });

  it('update writes before/after audit; role change is recorded and takes effect immediately', async () => {
    const id = await uid('engineer');
    const h = await t.auth('engineer');
    expect((await t.http.get(api('/audit-logs')).set(h)).status).toBe(403);
    const p = await t.http.patch(api(`/users/${id}`)).set(admin).send({ fullName: 'Engineer Renamed' });
    expect(p.status).toBe(200);
    const a = await t.prisma.auditLog.findFirstOrThrow({ where: { action: 'user.update', entityId: id } });
    expect((a.before as { fullName: string }).fullName).not.toBe('Engineer Renamed');
    expect((a.after as { fullName: string }).fullName).toBe('Engineer Renamed');

    const auditorRole = await rid('GENERAL_MANAGER'); // holds audit.view
    const cur = await rid('MAINTENANCE_ENGINEER');
    const put = await t.http.put(api(`/users/${id}/roles`)).set(admin).send({ roleIds: [cur, auditorRole] });
    expect(put.status).toBe(200);
    expect((await t.http.get(api('/audit-logs')).set(h)).status).toBe(200); // same token, new permission
    const ra = await t.prisma.auditLog.findFirstOrThrow({ where: { action: 'user.roles.update', entityId: id } });
    expect((ra.before as { roleIds: string[] }).roleIds).toEqual([cur]);
    expect((ra.after as { roleIds: string[] }).roleIds.sort()).toEqual([cur, auditorRole].sort());
  });

  it('reset-password returns a temporary password, revokes sessions, forces change', async () => {
    const l = await t.http.post(api('/auth/login')).send({ username: 'supervisor', password: 'Passw0rd!' });
    const id = await uid('supervisor');
    const r = await t.http.post(api(`/users/${id}/reset-password`)).set(admin).send({});
    expect(r.status).toBe(200);
    expect(r.body.temporaryPassword).toBeTruthy();
    expect((await t.http.get(api('/auth/me')).set({ Authorization: `Bearer ${l.body.accessToken}` })).status).toBe(401);
    const l2 = await t.http.post(api('/auth/login')).send({ username: 'supervisor', password: r.body.temporaryPassword });
    expect(l2.status).toBe(200);
    expect(l2.body.user.mustChangePassword).toBe(true);
  });

  it('cannot deactivate yourself; list supports search and paging', async () => {
    const me = await uid('admin');
    expect((await t.http.patch(api(`/users/${me}`)).set(admin).send({ isActive: false })).status).toBe(409);
    const l = await t.http.get(api('/users?q=acc&pageSize=1')).set(admin);
    expect(l.status).toBe(200);
    expect(l.body.items).toHaveLength(1);
    expect(l.body.total).toBeGreaterThanOrEqual(2);
    expect(l.body.pageSize).toBe(1);
  });
});

describe('roles and permission matrix', () => {
  it('creating a role and granting a permission takes effect for a user holding it', async () => {
    const create = await t.http
      .post(api('/roles'))
      .set(admin)
      .send({ code: 'AUDITOR_X', nameAr: 'مراجع', nameEn: 'Auditor', permissionCodes: ['reports.view'] });
    expect(create.status).toBe(201);
    const roleId = create.body.id as string;
    const u = await t.http.post(api('/users')).set(admin).send({ username: 'aud1', password: 'Str0ngPass!', fullName: 'Aud', roleIds: [roleId] });
    expect(u.status).toBe(201);
    const login = await t.http.post(api('/auth/login')).send({ username: 'aud1', password: 'Str0ngPass!' });
    const h = { Authorization: `Bearer ${login.body.accessToken}` };
    expect((await t.http.get(api('/audit-logs')).set(h)).status).toBe(403);

    const grant = await t.http.put(api(`/roles/${roleId}/permissions`)).set(admin).send({ codes: ['reports.view', 'audit.view'] });
    expect(grant.status).toBe(200);
    expect((await t.http.get(api('/audit-logs')).set(h)).status).toBe(200);

    const revoke = await t.http.put(api(`/roles/${roleId}/permissions`)).set(admin).send({ codes: ['reports.view'] });
    expect(revoke.status).toBe(200);
    expect((await t.http.get(api('/audit-logs')).set(h)).status).toBe(403);

    const a = await t.prisma.auditLog.findMany({ where: { action: 'role.permissions.update', entityId: roleId }, orderBy: { createdAt: 'asc' } });
    expect(a).toHaveLength(2);
    expect(a[0]!.before).toEqual({ codes: ['reports.view'] });
    expect(a[0]!.after).toEqual({ codes: ['audit.view', 'reports.view'] });
  });

  it('deactivating a role removes its permissions from holders', async () => {
    const roleId = (await t.prisma.role.findUniqueOrThrow({ where: { code: 'AUDITOR_X' } })).id;
    await t.http.put(api(`/roles/${roleId}/permissions`)).set(admin).send({ codes: ['audit.view'] });
    const h = await t.auth('aud1');
    expect((await t.http.get(api('/audit-logs')).set(h)).status).toBe(200);
    expect((await t.http.patch(api(`/roles/${roleId}`)).set(admin).send({ isActive: false })).status).toBe(200);
    expect((await t.http.get(api('/audit-logs')).set(h)).status).toBe(403);
  });

  it('rejects unknown permission codes, duplicate role code, super-user edits', async () => {
    const roleId = await rid('TREASURY');
    expect((await t.http.put(api(`/roles/${roleId}/permissions`)).set(admin).send({ codes: ['nope.nope'] })).status).toBe(400);
    expect((await t.http.post(api('/roles')).set(admin).send({ code: 'TREASURY', nameAr: 'a', nameEn: 'b' })).status).toBe(409);
    const su = await rid('SUPER_USER');
    expect((await t.http.put(api(`/roles/${su}/permissions`)).set(admin).send({ codes: [] })).status).toBe(409);
    expect((await t.http.patch(api(`/roles/${su}`)).set(admin).send({ isActive: false })).status).toBe(409);
  });

  it('matrix lists roles, permissions and grants', async () => {
    const m = await t.http.get(api('/roles/matrix')).set(admin);
    expect(m.status).toBe(200);
    expect(m.body.permissions.length).toBe(30);
    const acc = m.body.roles.find((r: { code: string }) => r.code === 'ACCOUNTANT');
    expect(m.body.grants[acc.id]).toContain('requests.edit_amounts');
  });
});

describe('delegations', () => {
  it('grants the delegator role while active and stops once it expires or is revoked', async () => {
    const fromId = await uid('manager');
    const toId = await uid('engineer');
    const toH = await t.auth('engineer');
    const mgrRole = await rid('CAMPAIGN_MANAGER');
    // engineer cannot see reports yet
    expect((await t.http.get(api('/assignments/current')).set(toH)).status).toBe(403);
    const mgrH = await t.auth('manager');
    const now = Date.now();
    const d = await t.http
      .post(api('/delegations'))
      .set(mgrH)
      .send({ toUserId: toId, roleId: mgrRole, startsAt: new Date(now - 1000).toISOString(), endsAt: new Date(now + 3600_000).toISOString(), reason: 'leave' });
    expect(d.status).toBe(201);
    expect(d.body.status).toBe('ACTIVE');
    const me = await t.http.get(api('/auth/me')).set(toH);
    const viaRole = me.body.roles.find((r: { code: string }) => r.code === 'CAMPAIGN_MANAGER');
    expect(viaRole.onBehalfOfUserId).toBe(fromId);
    expect((await t.http.get(api('/assignments/current')).set(toH)).status).toBe(200); // masterdata.view via delegation

    // expires: move the window into the past
    await t.prisma.delegation.update({ where: { id: d.body.id }, data: { endsAt: new Date(Date.now() - 1000) } });
    expect((await t.http.get(api('/assignments/current')).set(toH)).status).toBe(403);
    const listed = await t.http.get(api('/delegations?mine=1')).set(toH);
    expect(listed.body.find((x: { id: string }) => x.id === d.body.id).status).toBe('EXPIRED');
  });

  it('revoke ends it immediately; only the owner or delegations.manage_all may revoke or create for others', async () => {
    const toId = await uid('treasury');
    const mgrH = await t.auth('manager');
    const now = Date.now();
    const d = await t.http
      .post(api('/delegations'))
      .set(mgrH)
      .send({ toUserId: toId, startsAt: new Date(now - 1000).toISOString(), endsAt: new Date(now + 3600_000).toISOString() });
    expect(d.status).toBe(201);
    const tH = await t.auth('treasury');
    expect((await t.http.get(api('/assignments/current')).set(tH)).status).toBe(200);
    expect((await t.http.post(api(`/delegations/${d.body.id}/revoke`)).set(tH)).status).toBe(403);
    expect((await t.http.post(api(`/delegations/${d.body.id}/revoke`)).set(mgrH)).status).toBe(200);
    expect((await t.http.get(api('/assignments/current')).set(tH)).status).toBe(403);
    expect((await t.http.post(api(`/delegations/${d.body.id}/revoke`)).set(mgrH)).status).toBe(409);

    const other = await t.http
      .post(api('/delegations'))
      .set(tH)
      .send({ fromUserId: await uid('gm'), toUserId: toId, startsAt: new Date(now).toISOString(), endsAt: new Date(now + 1000).toISOString() });
    expect(other.status).toBe(403);
    const asAdmin = await t.http
      .post(api('/delegations'))
      .set(admin)
      .send({ fromUserId: await uid('gm'), toUserId: await uid('supervisor'), startsAt: new Date(now).toISOString(), endsAt: new Date(now + 1000).toISOString() });
    expect(asAdmin.status).toBe(201);
  });

  it('validates range, self-delegation and the role being held', async () => {
    const mgrH = await t.auth('manager');
    const now = Date.now();
    const base = { startsAt: new Date(now).toISOString(), endsAt: new Date(now + 1000).toISOString() };
    expect((await t.http.post(api('/delegations')).set(mgrH).send({ toUserId: await uid('gm'), startsAt: base.endsAt, endsAt: base.startsAt })).status).toBe(400);
    expect((await t.http.post(api('/delegations')).set(mgrH).send({ toUserId: await uid('manager'), ...base })).status).toBe(400);
    expect((await t.http.post(api('/delegations')).set(mgrH).send({ toUserId: await uid('gm'), roleId: await rid('TREASURY'), ...base })).status).toBe(400);
  });
});

describe('settings, notifications, lookups, audit', () => {
  it('settings: list, update with audit before/after, unknown key 404, wrong type 400, public subset', async () => {
    const list = await t.http.get(api('/settings')).set(admin);
    expect(list.status).toBe(200);
    expect(list.body.find((s: { key: string }) => s.key === 'workflow.lockTimeoutMinutes').value).toBe(15);
    const up = await t.http.put(api('/settings/workflow.lockTimeoutMinutes')).set(admin).send({ value: 30 });
    expect(up.status).toBe(200);
    expect(up.body.value).toBe(30);
    const a = await t.prisma.auditLog.findFirstOrThrow({ where: { action: 'setting.update', entityId: 'workflow.lockTimeoutMinutes' } });
    expect(a.before).toBe(15);
    expect(a.after).toBe(30);
    expect((await t.http.put(api('/settings/nope')).set(admin).send({ value: 1 })).status).toBe(404);
    expect((await t.http.put(api('/settings/workflow.lockTimeoutMinutes')).set(admin).send({ value: 'x' })).status).toBe(400);
    const pub = await t.http.get(api('/settings/public')).set(await t.auth('treasury'));
    expect(pub.status).toBe(200);
    expect(pub.body['workflow.lockTimeoutMinutes']).toBe(30);
    expect(pub.body['sap.config']).toBeUndefined();
  });

  it('notifications: only own in-app rows; unread count, mark read, read-all', async () => {
    const me = await uid('gm');
    const other = await uid('chief');
    const mk = (recipientUserId: string, n: number) =>
      t.prisma.notification.create({ data: { channel: 'IN_APP', recipientUserId, type: 'TEST', bodyAr: `n${n}`, status: 'SENT' } });
    const n1 = await mk(me, 1);
    await mk(me, 2);
    const foreign = await mk(other, 3);
    const h = await t.auth('gm');
    expect((await t.http.get(api('/notifications/unread-count')).set(h)).body.count).toBe(2);
    expect((await t.http.get(api('/notifications?unread=1')).set(h)).body.total).toBe(2);
    expect((await t.http.post(api(`/notifications/${n1.id}/read`)).set(h)).status).toBe(200);
    expect((await t.http.get(api('/notifications/unread-count')).set(h)).body.count).toBe(1);
    expect((await t.http.post(api(`/notifications/${foreign.id}/read`)).set(h)).status).toBe(404);
    expect((await t.http.post(api('/notifications/read-all')).set(h)).body.updated).toBe(1);
    expect((await t.http.get(api('/notifications')).set(h)).body.total).toBe(2);
  });

  it('lookups: every entity answers with {id, code, label}, filters by q, unknown entity 404', async () => {
    const h = await t.auth('treasury');
    for (const e of ['roles', 'users', 'departments', 'submitters', 'vehicles', 'vehicle-types', 'cost-centers', 'gl-accounts', 'expense-types', 'treasuries', 'request-types']) {
      const r = await t.http.get(api(`/lookups/${e}`)).set(h);
      expect(r.status, e).toBe(200);
      expect(r.body.length, e).toBeGreaterThan(0);
      expect(Object.keys(r.body[0]).sort(), e).toEqual(['code', 'id', 'label']);
    }
    const v = await t.http.get(api('/lookups/vehicles?q=2157')).set(h);
    expect(v.body.map((x: { code: string }) => x.code)).toEqual(['2157']);
    expect((await t.http.get(api('/lookups/nothing')).set(h)).status).toBe(404);
  });

  it('audit-log API filters by entity, action, actor and date, and pages', async () => {
    const id = await uid('engineer');
    const r = await t.http.get(api(`/audit-logs?entityType=User&entityId=${id}`)).set(admin);
    expect(r.status).toBe(200);
    expect(r.body.total).toBeGreaterThanOrEqual(2);
    expect(r.body.items[0]).toHaveProperty('before');
    const byAction = await t.http.get(api('/audit-logs?action=role.')).set(admin);
    expect(byAction.body.items.every((x: { action: string }) => x.action.startsWith('role.'))).toBe(true);
    const adminId = await uid('admin');
    const byActor = await t.http.get(api(`/audit-logs?actorUserId=${adminId}&pageSize=2`)).set(admin);
    expect(byActor.body.items).toHaveLength(2);
    const future = await t.http.get(api(`/audit-logs?from=${new Date(Date.now() + 86400000).toISOString()}`)).set(admin);
    expect(future.body.total).toBe(0);
    const q = await t.http.get(api('/audit-logs?q=setting.update')).set(admin);
    expect(q.body.total).toBeGreaterThanOrEqual(1);
  });
});
