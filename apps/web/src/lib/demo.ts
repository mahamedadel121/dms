/** Demo mode (build-time public env). With the flag off the app behaves exactly as before. */

export interface DemoUser {
  username: string;
  roleAr: string;
  roleEn: string;
}

/** Ordered demo accounts (seeded by packages/db/prisma/seed.ts). */
export const DEMO_USERS: readonly DemoUser[] = [
  { username: 'admin', roleAr: 'مدير النظام', roleEn: 'System admin' },
  { username: 'supervisor', roleAr: 'مسؤول الحملة', roleEn: 'Campaign supervisor' },
  { username: 'engineer', roleAr: 'مهندس الصيانة', roleEn: 'Maintenance engineer' },
  { username: 'shipping', roleAr: 'مسؤول الشحن', roleEn: 'Shipping officer' },
  { username: 'manager', roleAr: 'مدير الحملة', roleEn: 'Campaign manager' },
  { username: 'accountant1', roleAr: 'محاسب', roleEn: 'Accountant' },
  { username: 'chief', roleAr: 'رئيس الحسابات', roleEn: 'Chief accountant' },
  { username: 'gm', roleAr: 'المدير العام', roleEn: 'General manager' },
  { username: 'treasury', roleAr: 'الخزينة', roleEn: 'Treasury' },
];

export function isDemoMode(): boolean {
  return process.env.NEXT_PUBLIC_DEMO_MODE === '1';
}

export function demoPassword(): string {
  return process.env.NEXT_PUBLIC_DEMO_PASSWORD || 'Passw0rd!';
}

/** Optional company name shown in the brand areas; `null` = use the product name. */
export function companyName(): string | null {
  const v = process.env.NEXT_PUBLIC_COMPANY_NAME?.trim();
  return v ? v : null;
}

export function demoRoleLabel(u: DemoUser, locale: string): string {
  return locale === 'en' ? u.roleEn : u.roleAr;
}

const TOAST_KEY = 'dms.demoToast';

/** Survives the full page reload that follows a user switch. */
export function stashDemoToast(message: string): void {
  try {
    sessionStorage.setItem(TOAST_KEY, message);
  } catch {
    /* storage unavailable */
  }
}

export function takeDemoToast(): string | null {
  try {
    const v = sessionStorage.getItem(TOAST_KEY);
    if (v) sessionStorage.removeItem(TOAST_KEY);
    return v;
  } catch {
    return null;
  }
}
