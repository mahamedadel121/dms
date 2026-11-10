import { describe, expect, it } from 'vitest';
import { DomainError, isDomainError } from '../errors';
import { getConfig } from '../config';

describe('DomainError', () => {
  it('maps codes to default http statuses', () => {
    expect(new DomainError('VALIDATION', 'x').httpStatus).toBe(400);
    expect(new DomainError('UNAUTHENTICATED', 'x').httpStatus).toBe(401);
    expect(new DomainError('FORBIDDEN', 'x').httpStatus).toBe(403);
    expect(new DomainError('NOT_FOUND', 'x').httpStatus).toBe(404);
    expect(new DomainError('CONFLICT', 'x').httpStatus).toBe(409);
    expect(new DomainError('LOCKED', 'x').httpStatus).toBe(409);
    expect(new DomainError('INVALID_STATE', 'x').httpStatus).toBe(409);
    expect(new DomainError('NOT_IMPLEMENTED', 'x').httpStatus).toBe(501);
  });
  it('allows overriding status and carries details', () => {
    const e = new DomainError('LOCKED', 'locked by Ali', 423, { holder: 'Ali' });
    expect(e.httpStatus).toBe(423);
    expect(e.details).toEqual({ holder: 'Ali' });
    expect(isDomainError(e)).toBe(true);
    expect(e).toBeInstanceOf(Error);
    expect(isDomainError(new Error('x'))).toBe(false);
  });
});

describe('getConfig', () => {
  it('applies defaults and coerces numbers', () => {
    const c = getConfig({ API_PORT: '5000' });
    expect(c.API_PORT).toBe(5000);
    expect(c.WEB_PORT).toBe(3000);
    expect(c.STORAGE_DRIVER).toBe('local');
    expect(c.SAP_ADAPTER).toBe('mock');
    expect(c.BOT_TOKEN).toBeUndefined();
  });
  it('treats empty strings as unset', () => {
    expect(getConfig({ BOT_TOKEN: '', PDF_BROWSER_CHANNEL: '' }).BOT_TOKEN).toBeUndefined();
  });
  it('rejects invalid values', () => {
    expect(() => getConfig({ SAP_ADAPTER: 'oracle' })).toThrow(DomainError);
    expect(() => getConfig({ API_PORT: 'abc' })).toThrow(/Invalid environment/);
  });
  it('requires strong secrets in production', () => {
    expect(() => getConfig({ NODE_ENV: 'production' })).toThrow(/JWT_SECRET/);
    const ok = getConfig({
      NODE_ENV: 'production',
      JWT_SECRET: 'x'.repeat(40),
      FILE_URL_SECRET: 'y'.repeat(40),
    });
    expect(ok.NODE_ENV).toBe('production');
  });
});
