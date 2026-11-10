import type { Dict, Locale } from './types';
import arCommon from './ar/common';
import arAdmin from './ar/admin';
import arMaster from './ar/master';
import arRequests from './ar/requests';
import arWorkflows from './ar/workflows';
import arTemplates from './ar/templates';
import arReports from './ar/reports';
import arSap from './ar/sap';
import arDashboard from './ar/dashboard';
import enCommon from './en/common';
import enAdmin from './en/admin';
import enMaster from './en/master';
import enRequests from './en/requests';
import enWorkflows from './en/workflows';
import enTemplates from './en/templates';
import enReports from './en/reports';
import enSap from './en/sap';
import enDashboard from './en/dashboard';

export * from './types';

/** Fixed namespace list (PLAN §13). A key is `<namespace>.<key within that file>`. */
export const NAMESPACES = ['common', 'admin', 'master', 'requests', 'workflows', 'templates', 'reports', 'sap', 'dashboard'] as const;
export type Namespace = (typeof NAMESPACES)[number];

export const dictionaries: Record<Locale, Record<Namespace, Dict>> = {
  ar: {
    common: arCommon,
    admin: arAdmin,
    master: arMaster,
    requests: arRequests,
    workflows: arWorkflows,
    templates: arTemplates,
    reports: arReports,
    sap: arSap,
    dashboard: arDashboard,
  },
  en: {
    common: enCommon,
    admin: enAdmin,
    master: enMaster,
    requests: enRequests,
    workflows: enWorkflows,
    templates: enTemplates,
    reports: enReports,
    sap: enSap,
    dashboard: enDashboard,
  },
};

export type Params = Record<string, string | number>;

function lookup(locale: Locale, key: string): string | undefined {
  const dot = key.indexOf('.');
  if (dot < 0) return undefined;
  const ns = key.slice(0, dot) as Namespace;
  const rest = key.slice(dot + 1);
  return dictionaries[locale][ns]?.[rest];
}

/**
 * Pure translation: `translate('ar', 'common.save')`. Falls back to the other language,
 * then to the key itself. `{name}` placeholders are replaced from `params`.
 */
export function translate(locale: Locale, key: string, params?: Params): string {
  const other: Locale = locale === 'ar' ? 'en' : 'ar';
  let s = lookup(locale, key) ?? lookup(other, key) ?? key;
  if (params) for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

/** Picks the Arabic or English variant of a `{nameAr, nameEn}` pair. */
export function pickName(locale: Locale, o: { nameAr?: string | null; nameEn?: string | null } | null | undefined): string {
  if (!o) return '';
  return (locale === 'ar' ? o.nameAr || o.nameEn : o.nameEn || o.nameAr) ?? '';
}
