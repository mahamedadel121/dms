import { describe, expect, it } from 'vitest';
import { PERMISSIONS as P } from '@dms/shared';
import { DEMO_NAV_HREFS, NAV, findNavItem, navSlug, visibleNav } from './nav';

describe('nav', () => {
  it('navSlug', () => {
    expect(navSlug('/admin/request-types')).toBe('admin-request-types');
    expect(navSlug('/inbox')).toBe('inbox');
  });

  it('findNavItem picks the longest match', () => {
    const hit = findNavItem('/admin/request-types/x');
    expect(hit?.item.href).toBe('/admin/request-types');
    expect(hit?.group.key).toBe('config');
    expect(findNavItem('/requests/abc')?.item.href).toBe('/requests');
    expect(findNavItem('/profile')).toBeNull();
  });

  it('hrefs are unique', () => {
    const hrefs = NAV.flatMap((g) => g.items.map((i) => i.href));
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it('request types needs request_types.manage', () => {
    const item = NAV.flatMap((g) => g.items).find((i) => i.href === '/admin/request-types');
    expect(item?.permission).toBe(P.REQUEST_TYPES_MANAGE);
  });

  it('visibleNav is the full NAV unless demo mode', () => {
    expect(visibleNav(false)).toBe(NAV);
  });

  it('demo mode keeps only the allow-list, in nav order', () => {
    const hrefs = visibleNav(true).flatMap((g) => g.items.map((i) => i.href));
    expect(hrefs).toEqual([
      '/inbox', '/requests', '/vehicle-changes', '/assignments', '/dashboard', '/reports',
      '/workflows', '/templates', '/master/expense-types', '/master/drivers', '/master/vehicles', '/admin/users',
    ]);
    expect(hrefs).not.toContain('/sap');
    expect(visibleNav(true).every((g) => g.items.length > 0)).toBe(true);
    // routes stay reachable: findNavItem still resolves hidden pages
    expect(findNavItem('/sap')).not.toBeNull();
    const all = NAV.flatMap((g) => g.items.map((i) => i.href));
    for (const h of DEMO_NAV_HREFS) expect(all).toContain(h);
  });

  it('groups are work, insight, config, data, admin', () => {
    expect(NAV.map((g) => g.key)).toEqual(['work', 'insight', 'config', 'data', 'admin']);
  });
});
