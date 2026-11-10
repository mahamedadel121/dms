import { describe, expect, it } from 'vitest';
import { delegationStatus } from './delegation';

const now = new Date('2026-06-15T12:00:00Z');

describe('delegationStatus', () => {
  it('ACTIVE', () => {
    expect(delegationStatus({ startsAt: '2026-06-01T00:00:00Z', endsAt: '2026-06-30T00:00:00Z' }, now)).toBe('ACTIVE');
  });
  it('UPCOMING', () => {
    expect(delegationStatus({ startsAt: '2026-06-20T00:00:00Z', endsAt: '2026-06-30T00:00:00Z' }, now)).toBe('UPCOMING');
  });
  it('ENDED', () => {
    expect(delegationStatus({ startsAt: '2026-05-01T00:00:00Z', endsAt: '2026-06-01T00:00:00Z' }, now)).toBe('ENDED');
  });
  it('REVOKED wins', () => {
    expect(delegationStatus({ startsAt: '2026-06-01T00:00:00Z', endsAt: '2026-06-30T00:00:00Z', revokedAt: '2026-06-10T00:00:00Z' }, now)).toBe('REVOKED');
    expect(delegationStatus({ startsAt: '2026-05-01T00:00:00Z', endsAt: '2026-06-01T00:00:00Z', revokedAt: '2026-05-10T00:00:00Z' }, now)).toBe('REVOKED');
  });
});
