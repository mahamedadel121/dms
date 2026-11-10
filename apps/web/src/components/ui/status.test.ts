import { describe, expect, it } from 'vitest';
import { statusIconName, statusTone } from './status';

describe('status mapping', () => {
  it('request', () => {
    expect(statusTone('request', 'IN_REVIEW')).toBe('blue');
    expect(statusIconName('request', 'PAID')).toBe('Banknote');
  });
  it('step', () => {
    expect(statusTone('step', 'AWAITING_CORRECTION')).toBe('amber');
    expect(statusIconName('step', 'NOT_APPLICABLE')).toBe('Minus');
  });
  it('sap', () => {
    expect(statusTone('sap', 'POSTED')).toBe('green');
    expect(statusIconName('sap', 'POSTING')).toBe('RefreshCw');
  });
  it('export', () => {
    expect(statusTone('export', 'FAILED')).toBe('red');
    expect(statusIconName('export', 'EXPIRED')).toBe('Ban');
  });
  it('version', () => {
    expect(statusTone('version', 'DRAFT')).toBe('amber');
    expect(statusIconName('version', 'ARCHIVED')).toBe('Archive');
  });
  it('delegation', () => {
    expect(statusTone('delegation', 'UPCOMING')).toBe('blue');
    expect(statusIconName('delegation', 'REVOKED')).toBe('X');
  });
  it('unknown status falls back to gray', () => {
    expect(statusTone('request', 'WHATEVER')).toBe('gray');
    expect(statusIconName('sap', 'WHATEVER')).toBe('Circle');
  });
});
