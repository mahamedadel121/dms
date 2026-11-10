import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { verifyLinkToken } from '@dms/core/telegram';
import { createTestApp, type TestApp } from '../helpers';

const api = (p: string) => `/api/v1${p}`;
let t: TestApp;
let admin: { Authorization: string };
let sup: { Authorization: string };
let acc: { Authorization: string };
const ids: Record<string, string> = {};

beforeAll(async () => {
  t = await createTestApp('p2-tg-link');
  admin = await t.auth('admin');
  sup = await t.auth('supervisor');
  acc = await t.auth('accountant1');
  for (const u of ['admin', 'supervisor', 'accountant1', 'manager']) {
    ids[u] = (await t.prisma.user.findUniqueOrThrow({ where: { username: u } })).id;
  }
});
afterAll(async () => {
  await t?.close();
});

describe('telegram link for users and drivers', () => {
  it('a user issues a link for himself', async () => {
    const r = await t.http.post(api(`/users/${ids.supervisor}/telegram-link`)).set(sup);
    expect(r.status).toBe(200);
    expect(r.body.command).toMatch(/^\/start u_/);
    const token = r.body.command.replace('/start ', '');
    expect(verifyLinkToken(token)).toEqual({ kind: 'u', id: ids.supervisor });
    expect(typeof r.body.expiresAt).toBe('string');
  });

  it('403 for another user without users.manage', async () => {
    expect((await t.http.post(api(`/users/${ids.manager}/telegram-link`)).set(sup)).status).toBe(403);
    expect((await t.http.post(api(`/users/${ids.manager}/telegram-unlink`)).set(sup)).status).toBe(403);
  });

  it('an admin issues a link for another user', async () => {
    const r = await t.http.post(api(`/users/${ids.manager}/telegram-link`)).set(admin);
    expect(r.status).toBe(200);
    expect(verifyLinkToken(r.body.command.replace('/start ', ''))).toEqual({ kind: 'u', id: ids.manager });
    expect(await t.prisma.auditLog.count({ where: { action: 'user.telegram_link_issued', entityId: ids.manager } })).toBe(1);
  });

  it('409 when already linked', async () => {
    await t.prisma.user.update({ where: { id: ids.accountant1 }, data: { telegramUserId: 777001n, telegramChatId: 777001n } });
    const r = await t.http.post(api(`/users/${ids.accountant1}/telegram-link`)).set(acc);
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('INVALID_STATE');
  });

  it('unlink clears the fields and audits', async () => {
    const r = await t.http.post(api(`/users/${ids.accountant1}/telegram-unlink`)).set(acc);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true });
    const u = await t.prisma.user.findUniqueOrThrow({ where: { id: ids.accountant1 } });
    expect(u.telegramUserId).toBeNull();
    expect(u.telegramChatId).toBeNull();
    const a = await t.prisma.auditLog.findFirstOrThrow({ where: { action: 'user.telegram_unlink', entityId: ids.accountant1 } });
    expect(JSON.stringify(a.before)).toContain('777001');
  });

  it('409 when not linked', async () => {
    expect((await t.http.post(api(`/users/${ids.accountant1}/telegram-unlink`)).set(acc)).status).toBe(409);
  });

  it('the driver link needs submitters.telegram_link', async () => {
    const d = await t.prisma.submitter.findUniqueOrThrow({ where: { code: 'DRV001' } });
    expect((await t.http.post(api(`/submitters/${d.id}/telegram-link`)).set(sup)).status).toBe(403);
  });

  it('the driver link returns a d_ token', async () => {
    const d = await t.prisma.submitter.findUniqueOrThrow({ where: { code: 'DRV001' } });
    const r = await t.http.post(api(`/submitters/${d.id}/telegram-link`)).set(admin);
    expect(r.status).toBe(200);
    expect(r.body.command).toMatch(/^\/start d_/);
    expect(verifyLinkToken(r.body.command.replace('/start ', ''))).toEqual({ kind: 'd', id: d.id });
    expect(await t.prisma.auditLog.count({ where: { action: 'submitter.telegram_link_issued', entityId: d.id } })).toBe(1);
  });

  it('409 for a linked driver', async () => {
    const d = await t.prisma.submitter.findUniqueOrThrow({ where: { code: 'DRV002' } });
    await t.prisma.submitter.update({ where: { id: d.id }, data: { telegramUserId: 888002n, telegramChatId: 888002n } });
    expect((await t.http.post(api(`/submitters/${d.id}/telegram-link`)).set(admin)).status).toBe(409);
  });

  it('/auth/me reports telegramLinked', async () => {
    const before = await t.http.get(api('/auth/me')).set(sup);
    expect(before.body.telegramLinked).toBe(false);
    await t.prisma.user.update({ where: { id: ids.supervisor }, data: { telegramUserId: 777002n, telegramChatId: 777002n } });
    const after = await t.http.get(api('/auth/me')).set(sup);
    expect(after.body.telegramLinked).toBe(true);
  });
});
