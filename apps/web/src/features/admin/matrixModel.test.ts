import { describe, expect, it } from 'vitest';
import { diffMatrix, filterPermissions, groupState, toggleGroup } from './matrixModel';

describe('matrixModel', () => {
  it('diffMatrix lists added and removed', () => {
    const d = diffMatrix({ r1: ['a', 'b'], r2: ['x'] }, { r1: ['b', 'c'], r2: ['x'] });
    expect(d).toEqual([{ roleId: 'r1', added: ['c'], removed: ['a'] }]);
  });

  it('no diff when equal', () => {
    expect(diffMatrix({ r1: ['a', 'b'] }, { r1: ['b', 'a'] })).toEqual([]);
  });

  it('groupState all / some / none', () => {
    const codes = ['a', 'b', 'c'];
    expect(groupState(codes, new Set(['a', 'b', 'c', 'z']))).toBe('all');
    expect(groupState(codes, new Set(['a']))).toBe('some');
    expect(groupState(codes, new Set(['z']))).toBe('none');
  });

  it('toggleGroup on and off', () => {
    const base = new Set(['a', 'z']);
    const on = toggleGroup(base, ['a', 'b'], true);
    expect([...on].sort()).toEqual(['a', 'b', 'z']);
    expect([...base].sort()).toEqual(['a', 'z']);
    const off = toggleGroup(on, ['a', 'b'], false);
    expect([...off]).toEqual(['z']);
  });

  it('filterPermissions by name and code', () => {
    const meta = [
      { code: 'users.manage', groupKey: 'admin', nameAr: 'إدارة المستخدمين', nameEn: 'Manage users' },
      { code: 'requests.view', groupKey: 'requests', nameAr: 'عرض الطلبات', nameEn: 'View requests' },
    ];
    expect(filterPermissions(meta, '', 'en')).toHaveLength(2);
    expect(filterPermissions(meta, 'MANAGE', 'en').map((p) => p.code)).toEqual(['users.manage']);
    expect(filterPermissions(meta, 'عرض', 'ar').map((p) => p.code)).toEqual(['requests.view']);
    expect(filterPermissions(meta, 'requests.', 'ar').map((p) => p.code)).toEqual(['requests.view']);
  });
});
