import { describe, expect, it } from 'vitest';
import { can } from './permissions';
import { cairoDayToIso, formatDate, formatDateTime, formatEgp, formatNumber } from './format';
import { dictionaries, NAMESPACES, pickName, translate } from '../i18n';
import { qs } from './api';

describe('can()', () => {
  const user = { isSuperUser: false, permissions: ['requests.view', 'masterdata.view'] };
  it('allows held permission', () => expect(can(user, 'requests.view')).toBe(true));
  it('denies missing permission', () => expect(can(user, 'users.manage')).toBe(false));
  it('any-of for arrays', () => {
    expect(can(user, ['users.manage', 'masterdata.view'])).toBe(true);
    expect(can(user, ['users.manage', 'roles.manage'])).toBe(false);
  });
  it('super user passes everything', () => expect(can({ isSuperUser: true, permissions: [] }, 'anything')).toBe(true));
  it('no requirement is allowed; no user is denied', () => {
    expect(can(null, undefined)).toBe(true);
    expect(can(null, 'requests.view')).toBe(false);
  });
});

describe('format', () => {
  it('formats Cairo date with DST', () => {
    expect(formatDateTime('2026-01-15T22:30:00Z')).toBe('2026-01-16 00:30'); // UTC+2
    expect(formatDateTime('2026-07-15T21:30:00Z')).toBe('2026-07-16 00:30'); // UTC+3
    expect(formatDate('2026-07-15T21:30:00Z')).toBe('2026-07-16');
  });
  it('handles empty/invalid', () => {
    expect(formatDate(null)).toBe('');
    expect(formatDateTime('nope')).toBe('');
  });
  it('formats EGP', () => {
    expect(formatNumber('1234.5')).toBe('1,234.50');
    expect(formatEgp('1234.5', 'en')).toBe('EGP 1,234.50');
    expect(formatEgp('1234.5', 'ar')).toBe('1,234.50 ج.م');
    expect(formatEgp(null)).toBe('');
  });
  it('maps a Cairo day to ISO instants', () => {
    expect(cairoDayToIso('2026-01-16')).toBe('2026-01-15T22:00:00.000Z');
    expect(cairoDayToIso('2026-07-16')).toBe('2026-07-15T21:00:00.000Z');
    expect(cairoDayToIso('2026-01-16', true)).toBe('2026-01-16T21:59:59.999Z');
  });
});

describe('i18n', () => {
  it('translates and interpolates', () => {
    expect(translate('ar', 'common.save')).toBe('حفظ');
    expect(translate('en', 'common.save')).toBe('Save');
    expect(translate('en', 'common.rowsTotal', { n: 5 })).toBe('Total: 5');
  });
  it('falls back to the key', () => expect(translate('ar', 'common.nope.x')).toBe('common.nope.x'));
  it('picks names by locale', () => {
    expect(pickName('ar', { nameAr: 'أ', nameEn: 'A' })).toBe('أ');
    expect(pickName('en', { nameAr: 'أ', nameEn: 'A' })).toBe('A');
    expect(pickName('en', { nameAr: 'أ', nameEn: '' })).toBe('أ');
  });
  it('ar and en have the same keys in every WP6 namespace', () => {
    for (const ns of ['common', 'admin', 'master'] as const) {
      expect(Object.keys(dictionaries.en[ns]).sort(), ns).toEqual(Object.keys(dictionaries.ar[ns]).sort());
    }
  });
  it('registers all namespaces for both languages', () => {
    for (const ns of NAMESPACES) {
      expect(dictionaries.ar[ns]).toBeDefined();
      expect(dictionaries.en[ns]).toBeDefined();
    }
  });
});

describe('qs', () => {
  it('skips empty values and joins arrays', () => {
    expect(qs({ a: 1, b: '', c: undefined, d: [1, 2], e: false })).toBe('?a=1&d=1%2C2&e=false');
    expect(qs({})).toBe('');
  });
});
