import { afterEach, describe, expect, it } from 'vitest';
import { resetConfigCache } from '../config';
import { buildLinkInfo, createLinkToken, verifyLinkToken } from './index';

const ID25 = 'ckx1234567890abcdefghijkl';
afterEach(() => {
  delete process.env.BOT_USERNAME;
  resetConfigCache();
});

describe('telegram link token', () => {
  it('round-trips a user token', () => {
    const { token } = createLinkToken({ kind: 'u', id: 'abc123' });
    expect(verifyLinkToken(token)).toEqual({ kind: 'u', id: 'abc123' });
  });
  it('round-trips a driver token', () => {
    const { token } = createLinkToken({ kind: 'd', id: 'xyz789' });
    expect(verifyLinkToken(token)).toEqual({ kind: 'd', id: 'xyz789' });
  });
  it('stays within 64 characters for a 25-character id', () => {
    expect(createLinkToken({ kind: 'u', id: ID25 }).token.length).toBeLessThanOrEqual(64);
  });
  it('uses only letters, digits and underscore', () => {
    expect(createLinkToken({ kind: 'd', id: ID25 }).token).toMatch(/^[A-Za-z0-9_]+$/);
  });
  it('rejects an expired token', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const { token } = createLinkToken({ kind: 'u', id: 'abc123', ttlSec: 60, now });
    expect(verifyLinkToken(token, new Date(now.getTime() + 30_000))).not.toBeNull();
    expect(verifyLinkToken(token, new Date(now.getTime() + 61_000))).toBeNull();
  });
  it('rejects a tampered signature', () => {
    const { token } = createLinkToken({ kind: 'u', id: 'abc123' });
    const last = token.slice(-1) === '0' ? '1' : '0';
    expect(verifyLinkToken(token.slice(0, -1) + last)).toBeNull();
  });
  it('rejects a changed id', () => {
    const { token } = createLinkToken({ kind: 'u', id: 'abc123' });
    expect(verifyLinkToken(token.replace('abc123', 'abc124'))).toBeNull();
  });
  it('rejects malformed input', () => {
    for (const s of ['', 'x', 'u_abc']) expect(verifyLinkToken(s)).toBeNull();
  });
  it('throws for an id with other characters', () => {
    expect(() => createLinkToken({ kind: 'u', id: 'a_b' })).toThrow();
    expect(() => createLinkToken({ kind: 'u', id: 'a-b' })).toThrow();
  });
  it('buildLinkInfo has no deep link without BOT_USERNAME', () => {
    delete process.env.BOT_USERNAME;
    resetConfigCache();
    const i = buildLinkInfo({ kind: 'u', id: 'abc123' });
    expect(i.deepLink).toBeNull();
    expect(i.command).toMatch(/^\/start u_/);
  });
  it('builds the t.me deep link', () => {
    process.env.BOT_USERNAME = 'dms_test_bot';
    resetConfigCache();
    const i = buildLinkInfo({ kind: 'd', id: 'abc123' });
    expect(i.deepLink).toBe(`https://t.me/dms_test_bot?start=${i.command.replace('/start ', '')}`);
  });
});
