import { describe, expect, it } from 'vitest';
import { PERMISSIONS as P } from '@dms/shared';
import { NAV, findNavItem, navSlug } from './nav';

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

  it('groups are work, insight, config, data, admin', () => {
    expect(NAV.map((g) => g.key)).toEqual(['work', 'insight', 'config', 'data', 'admin']);
  });
});
