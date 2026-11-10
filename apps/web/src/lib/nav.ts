import { PERMISSIONS as P } from '@dms/shared';

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

/** Static sidebar config listing every route (PLAN §13). Items are filtered by `can()`. */
export const NAV: NavGroup[] = [
  {
    key: 'main',
    labelKey: 'common.nav.main',
    items: [
      { href: '/inbox', labelKey: 'common.nav.inbox', permission: P.REQUESTS_VIEW, icon: 'Inbox' },
      { href: '/requests', labelKey: 'common.nav.requests', permission: P.REQUESTS_VIEW, icon: 'FileText' },
      { href: '/vehicle-changes', labelKey: 'common.nav.vehicleChanges', permission: P.VEHICLE_CHANGES_VIEW, icon: 'ArrowLeftRight' },
      { href: '/assignments', labelKey: 'common.nav.assignments', permission: P.MASTERDATA_VIEW, icon: 'Truck' },
      { href: '/workflows', labelKey: 'common.nav.workflows', permission: P.WORKFLOWS_VIEW, icon: 'GitBranch' },
      { href: '/templates', labelKey: 'common.nav.templates', permission: P.TEMPLATES_MANAGE, icon: 'LayoutTemplate' },
      { href: '/sap', labelKey: 'common.nav.sap', permission: P.SAP_VIEW, icon: 'Server' },
      { href: '/reports', labelKey: 'common.nav.reports', permission: P.REPORTS_VIEW, icon: 'BarChart3' },
      { href: '/dashboard', labelKey: 'common.nav.dashboard', permission: P.DASHBOARD_VIEW, icon: 'LayoutDashboard' },
    ],
  },
  {
    key: 'master',
    labelKey: 'common.nav.master',
    items: [
      { href: '/master/drivers', labelKey: 'common.nav.drivers', permission: P.MASTERDATA_VIEW, icon: 'Users' },
      { href: '/master/vehicles', labelKey: 'common.nav.vehicles', permission: P.MASTERDATA_VIEW, icon: 'Car' },
      { href: '/master/vehicle-types', labelKey: 'common.nav.vehicleTypes', permission: P.MASTERDATA_VIEW, icon: 'Tags' },
      { href: '/master/cost-centers', labelKey: 'common.nav.costCenters', permission: P.MASTERDATA_VIEW, icon: 'Building2' },
      { href: '/master/gl-accounts', labelKey: 'common.nav.glAccounts', permission: P.MASTERDATA_VIEW, icon: 'BookOpen' },
      { href: '/master/expense-types', labelKey: 'common.nav.expenseTypes', permission: P.MASTERDATA_VIEW, icon: 'Receipt' },
      { href: '/master/treasuries', labelKey: 'common.nav.treasuries', permission: P.MASTERDATA_VIEW, icon: 'Landmark' },
      { href: '/master/sap-settings', labelKey: 'common.nav.sapSettings', permission: P.SETTINGS_MANAGE, icon: 'Settings2' },
    ],
  },
  {
    key: 'admin',
    labelKey: 'common.nav.admin',
    items: [
      { href: '/admin/users', labelKey: 'common.nav.users', permission: P.USERS_VIEW, icon: 'UserCog' },
      { href: '/admin/roles', labelKey: 'common.nav.roles', permission: [P.USERS_VIEW, P.ROLES_MANAGE], icon: 'ShieldCheck' },
      { href: '/admin/delegations', labelKey: 'common.nav.delegations', icon: 'UserCheck' },
      { href: '/admin/departments', labelKey: 'common.nav.departments', permission: P.MASTERDATA_VIEW, icon: 'Network' },
      { href: '/admin/audit', labelKey: 'common.nav.audit', permission: P.AUDIT_VIEW, icon: 'ScrollText' },
      { href: '/admin/settings', labelKey: 'common.nav.settings', permission: P.SETTINGS_MANAGE, icon: 'Settings' },
    ],
  },
];
