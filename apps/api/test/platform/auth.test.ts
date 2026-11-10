import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../helpers';

const PW = 'Passw0rd!';
let t: TestApp;

beforeAll(async () => {
  t = await createTestApp('wp1-auth');
});
afterAll(async () => {
  await t?.close();
});

const login = (username: string, password = PW) => t.http.post('/api/v1/auth/login').send({ username, password });

describe('auth', () => {
  it('login returns tokens and Me; /auth/me works with the access token', async () => {
    const r = await login('accountant1');
    expect(r.status).toBe(200);
    expect(r.body.accessToken).toBeTruthy();
    expect(r.body.refreshToken).toBeTruthy();
    expect(r.body.user.username).toBe('accountant1');
    expect(r.body.user.hasSignature).toBe(true);
    expect(r.body.user.permissions).toContain('requests.edit_amounts');
    const me = await t.http.get('/api/v1/auth/me').set('Authorization', `Bearer ${r.body.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.roles.map((x: { code: string }) => x.code)).toContain('ACCOUNTANT');
  });

  it('wrong password and unknown user give the same 401', async () => {
    const a = await login('accountant2', 'bad');
    const b = await login('nobody-here', 'bad');
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body.error.message).toBe(b.body.error.message);
  });

  it('refresh rotates the token; the old token revokes the whole session when reused', async () => {
    const l = await login('gm');
    const r1 = await t.http.post('/api/v1/auth/refresh').send({ refreshToken: l.body.refreshToken });
    expect(r1.status).toBe(200);
    expect(r1.body.refreshToken).not.toBe(l.body.refreshToken);
    // new access token works
    const ok = await t.http.get('/api/v1/auth/me').set('Authorization', `Bearer ${r1.body.accessToken}`);
    expect(ok.status).toBe(200);
    // reuse of the first (rotated) token => 401 and the session is revoked
    const reuse = await t.http.post('/api/v1/auth/refresh').send({ refreshToken: l.body.refreshToken });
    expect(reuse.status).toBe(401);
    const dead = await t.http.get('/api/v1/auth/me').set('Authorization', `Bearer ${r1.body.accessToken}`);
    expect(dead.status).toBe(401);
    const again = await t.http.post('/api/v1/auth/refresh').send({ refreshToken: r1.body.refreshToken });
    expect(again.status).toBe(401);
  });

  it('logout revokes the session', async () => {
    const l = await login('treasury');
    const h = { Authorization: `Bearer ${l.body.accessToken}` };
    expect((await t.http.post('/api/v1/auth/logout').set(h)).status).toBe(200);
    expect((await t.http.get('/api/v1/auth/me').set(h)).status).toBe(401);
    expect((await t.http.post('/api/v1/auth/refresh').send({ refreshToken: l.body.refreshToken })).status).toBe(401);
  });

  it('lists own sessions and revokes one by id', async () => {
    const a = await login('engineer');
    const b = await login('engineer');
    const ha = { Authorization: `Bearer ${a.body.accessToken}` };
    const list = await t.http.get('/api/v1/auth/sessions').set(ha);
    expect(list.status).toBe(200);
    expect(list.body.length).toBeGreaterThanOrEqual(2);
    expect(list.body.filter((s: { current: boolean }) => s.current)).toHaveLength(1);
    const other = list.body.find((s: { current: boolean }) => !s.current);
    expect((await t.http.delete(`/api/v1/auth/sessions/${other.id}`).set(ha)).status).toBe(200);
    // the other login (b) may or may not be the revoked one; one of them must now be dead
    const hb = { Authorization: `Bearer ${b.body.accessToken}` };
    const codes = [(await t.http.get('/api/v1/auth/me').set(ha)).status, (await t.http.get('/api/v1/auth/me').set(hb)).status];
    expect(codes.sort()).toEqual([200, 401]);
    // cannot revoke someone else's session
    const adminLogin = await login('admin');
    const adminSessions = await t.http.get('/api/v1/auth/sessions').set({ Authorization: `Bearer ${adminLogin.body.accessToken}` });
    const foreign = await t.http.delete(`/api/v1/auth/sessions/${list.body[0].id}`).set({ Authorization: `Bearer ${adminLogin.body.accessToken}` });
    expect(foreign.status).toBe(404);
    expect(adminSessions.body.length).toBeGreaterThanOrEqual(1);
  });

  it('locks the account after 5 failures; correct password is refused until the lock ends', async () => {
    for (let i = 0; i < 5; i++) expect((await login('shipping', 'wrong')).status).toBe(401);
    const locked = await login('shipping');
    expect(locked.status).toBe(403);
    expect(locked.body.error.details.reason).toBe('ACCOUNT_LOCKED');
    await t.prisma.user.update({ where: { username: 'shipping' }, data: { lockedUntil: new Date(Date.now() - 1000) } });
    expect((await login('shipping')).status).toBe(200);
    const u = await t.prisma.user.findUniqueOrThrow({ where: { username: 'shipping' } });
    expect(u.failedLoginCount).toBe(0);
    const audits = await t.prisma.auditLog.findMany({ where: { action: 'auth.lockout', entityId: u.id } });
    expect(audits.length).toBe(1);
  });

  it('rate-limits repeated login attempts per ip+username with 429', async () => {
    let last = 0;
    for (let i = 0; i < 25; i++) last = (await login('ratelimited-user', 'x')).status;
    expect(last).toBe(429);
    // other usernames are not affected
    expect((await login('supervisor')).status).toBe(200);
  });

  it('change-password verifies the current one, revokes other sessions', async () => {
    const a = await login('chief');
    const b = await login('chief');
    const ha = { Authorization: `Bearer ${a.body.accessToken}` };
    const bad = await t.http.post('/api/v1/auth/change-password').set(ha).send({ currentPassword: 'nope', newPassword: 'NewPassw0rd!' });
    expect(bad.status).toBe(400);
    const ok = await t.http.post('/api/v1/auth/change-password').set(ha).send({ currentPassword: PW, newPassword: 'NewPassw0rd!' });
    expect(ok.status).toBe(200);
    expect((await t.http.get('/api/v1/auth/me').set({ Authorization: `Bearer ${b.body.accessToken}` })).status).toBe(401);
    expect((await login('chief', PW)).status).toBe(401);
    expect((await login('chief', 'NewPassw0rd!')).status).toBe(200);
  });

  it('deactivated user cannot log in or use an existing token', async () => {
    const l = await login('manager');
    const admin = await t.auth('admin');
    const u = await t.prisma.user.findUniqueOrThrow({ where: { username: 'manager' } });
    expect((await t.http.patch(`/api/v1/users/${u.id}`).set(admin).send({ isActive: false })).status).toBe(200);
    expect((await t.http.get('/api/v1/auth/me').set({ Authorization: `Bearer ${l.body.accessToken}` })).status).toBe(401);
    expect((await login('manager')).status).toBe(401);
  });
});
