import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEMO_USERS, companyName, demoPassword, demoRoleLabel, isDemoMode } from './demo';

afterEach(() => vi.unstubAllEnvs());

describe('demo', () => {
  it('flag is on only for "1"', () => {
    vi.stubEnv('NEXT_PUBLIC_DEMO_MODE', '');
    expect(isDemoMode()).toBe(false);
    vi.stubEnv('NEXT_PUBLIC_DEMO_MODE', 'true');
    expect(isDemoMode()).toBe(false);
    vi.stubEnv('NEXT_PUBLIC_DEMO_MODE', '1');
    expect(isDemoMode()).toBe(true);
  });

  it('password defaults to Passw0rd! and can be overridden', () => {
    vi.stubEnv('NEXT_PUBLIC_DEMO_PASSWORD', '');
    expect(demoPassword()).toBe('Passw0rd!');
    vi.stubEnv('NEXT_PUBLIC_DEMO_PASSWORD', 'x1');
    expect(demoPassword()).toBe('x1');
  });

  it('company name is optional and trimmed', () => {
    vi.stubEnv('NEXT_PUBLIC_COMPANY_NAME', '');
    expect(companyName()).toBeNull();
    vi.stubEnv('NEXT_PUBLIC_COMPANY_NAME', '  Acme  ');
    expect(companyName()).toBe('Acme');
  });

  it('user list is ordered with role labels', () => {
    expect(DEMO_USERS.map((u) => u.username)).toEqual([
      'admin', 'supervisor', 'engineer', 'shipping', 'manager', 'accountant1', 'chief', 'gm', 'treasury',
    ]);
    expect(demoRoleLabel(DEMO_USERS[0]!, 'ar')).toBe('مدير النظام');
    expect(demoRoleLabel(DEMO_USERS[7]!, 'en')).toBe('General manager');
    for (const u of DEMO_USERS) expect(Boolean(u.roleAr && u.roleEn)).toBe(true);
  });
});
