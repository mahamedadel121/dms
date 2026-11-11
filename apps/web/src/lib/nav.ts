import { PERMISSIONS as P } from '@dms/shared';
import { isDemoMode } from './demo';

export interface NavItem {
  href: string;
  /** i18n key (common namespace) */
  labelKey: string;
  /** any-of permission codes; omitted = every signed-in user */
  permission?: string | readonly string[];
  /** lucide-react icon name resolved in the sidebar */
  icon: string;
}

export interface NavGroup {
  key: string;
  labelKey: string;
  items: NavItem[];
}

/** Static navigation config listing every route (DESIGN_SPEC 8.1). Items are filtered by `can()`. */
export const NAV: NavGroup[] = [
  {
    key: 'work',
    labelKey: 'shell.nav.work',
    items: [
      { href: '/inbox', labelKey: 'common.nav.inbox', permission: P.REQUESTS_VIEW, icon: 'Inbox' },
      { href: '/requests', labelKey: 'common.nav.requests', permission: P.REQUESTS_VIEW, icon: 'FileText' },
      { href: '/vehicle-changes', labelKey: 'common.nav.vehicleChanges', permission: P.VEHICLE_CHANGES_VIEW, icon: 'ArrowLeftRight' },
      { href: '/assignments', labelKey: 'common.nav.assignments', permission: P.MASTERDATA_VIEW, icon: 'Truck' },
    ],
  },
  {
    key: 'insight',
    labelKey: 'shell.nav.insight',
    items: [
      { href: '/dashboard', labelKey: 'common.nav.dashboard', permission: P.DASHBOARD_VIEW, icon: 'LayoutDashboard' },
      { href: '/reports', labelKey: 'common.nav.reports', permission: P.REPORTS_VIEW, icon: 'BarChart3' },
      { href: '/sap', labelKey: 'common.nav.sap', permission: P.SAP_VIEW, icon: 'Server' },
    ],
  },
  {
    key: 'config',
    labelKey: 'shell.nav.config',
    items: [
      { href: '/admin/request-types', labelKey: 'shell.nav.requestTypes', permission: P.REQUEST_TYPES_MANAGE, icon: 'FileStack' },
      { href: '/workflows', labelKey: 'common.nav.workflows', permission: P.WORKFLOWS_VIEW, icon: 'GitBranch' },
      { href: '/templates', labelKey: 'common.nav.templates', permission: P.TEMPLATES_MANAGE, icon: 'LayoutTemplate' },
      { href: '/master/expense-types', labelKey: 'common.nav.expenseTypes', permission: P.MASTERDATA_VIEW, icon: 'Receipt' },
      { href: '/master/sap-settings', labelKey: 'common.nav.sapSettings', permission: P.SETTINGS_MANAGE, icon: 'Settings2' },
      { href: '/admin/settings', labelKey: 'common.nav.settings', permission: P.SETTINGS_MANAGE, icon: 'Settings' },
    ],
  },
  {
    key: 'data',
    labelKey: 'shell.nav.data',
    items: [
      { href: '/master/drivers', labelKey: 'common.nav.drivers', permission: P.MASTERDATA_VIEW, icon: 'Users' },
      { href: '/master/vehicles', labelKey: 'common.nav.vehicles', permission: P.MASTERDATA_VIEW, icon: 'Car' },
      { href: '/master/vehicle-types', labelKey: 'common.nav.vehicleTypes', permission: P.MASTERDATA_VIEW, icon: 'Tags' },
      { href: '/master/cost-centers', labelKey: 'common.nav.costCenters', permission: P.MASTERDATA_VIEW, icon: 'Building2' },
      { href: '/master/gl-accounts', labelKey: 'common.nav.glAccounts', permission: P.MASTERDATA_VIEW, icon: 'BookOpen' },
      { href: '/master/treasuries', labelKey: 'common.nav.treasuries', permission: P.MASTERDATA_VIEW, icon: 'Landmark' },
      { href: '/admin/departments', labelKey: 'common.nav.departments', permission: P.MASTERDATA_VIEW, icon: 'Network' },
    ],
  },
  {
    key: 'admin',
    labelKey: 'shell.nav.admin',
    items: [
      { href: '/admin/users', labelKey: 'common.nav.users', permission: P.USERS_VIEW, icon: 'UserCog' },
      { href: '/admin/roles', labelKey: 'common.nav.roles', permission: [P.USERS_VIEW, P.ROLES_MANAGE], icon: 'ShieldCheck' },
      { href: '/admin/delegations', labelKey: 'common.nav.delegations', icon: 'UserCheck' },
      { href: '/admin/audit', labelKey: 'common.nav.audit', permission: P.AUDIT_VIEW, icon: 'ScrollText' },
    ],
  },
];

/** Pages shown in demo mode; every other route stays reachable by URL only. */
export const DEMO_NAV_HREFS: readonly string[] = [
  '/inbox', '/requests', '/vehicle-changes', '/assignments', '/dashboard', '/reports',
  '/workflows', '/templates', '/master/expense-types', '/master/drivers', '/master/vehicles', '/admin/users',
];

/** NAV as shown to the user: in demo mode only the demo allow-list (empty groups dropped). */
export function visibleNav(demo: boolean = isDemoMode()): NavGroup[] {
  if (!demo) return NAV;
  return NAV.map((g) => ({ ...g, items: g.items.filter((i) => DEMO_NAV_HREFS.includes(i.href)) })).filter((g) => g.items.length > 0);
}

/** `'/admin/request-types'` -> `'admin-request-types'` (used for `data-testid="nav-<slug>"`). */
export function navSlug(href: string): string {
  return href.replace(/^\/+|\/+$/g, '').replace(/\//g, '-');
}

/** The nav entry whose href equals the path or is a parent of it; the longest href wins. */
export function findNavItem(path: string): { group: NavGroup; item: NavItem } | null {
  let best: { group: NavGroup; item: NavItem } | null = null;
  for (const group of NAV) {
    for (const item of group.items) {
      if (path === item.href || path.startsWith(item.href + '/')) {
        if (!best || item.href.length > best.item.href.length) best = { group, item };
      }
    }
  }
  return best;
}
