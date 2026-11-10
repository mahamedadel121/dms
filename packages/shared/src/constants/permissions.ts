export const PERMISSIONS = {
  REQUESTS_VIEW: 'requests.view',
  REQUESTS_VIEW_ALL: 'requests.view_all',
  REQUESTS_ACT: 'requests.act',
  REQUESTS_EDIT_AMOUNTS: 'requests.edit_amounts',
  REQUESTS_RECLASSIFY: 'requests.reclassify',
  REQUESTS_CREATE: 'requests.create',
  REQUESTS_FORCE_UNLOCK: 'requests.force_unlock',
  VEHICLE_CHANGES_VIEW: 'vehicle_changes.view',
  VEHICLE_CHANGES_DECIDE: 'vehicle_changes.decide',
  ASSIGNMENTS_MANAGE: 'assignments.manage',
  MASTERDATA_VIEW: 'masterdata.view',
  MASTERDATA_MANAGE: 'masterdata.manage',
  SUBMITTERS_TELEGRAM_LINK: 'submitters.telegram_link',
  USERS_VIEW: 'users.view',
  USERS_MANAGE: 'users.manage',
  ROLES_MANAGE: 'roles.manage',
  SIGNATURES_MANAGE: 'signatures.manage',
  DELEGATIONS_MANAGE_ALL: 'delegations.manage_all',
  REQUEST_TYPES_MANAGE: 'request_types.manage',
  WORKFLOWS_VIEW: 'workflows.view',
  WORKFLOWS_MANAGE: 'workflows.manage',
  TEMPLATES_MANAGE: 'templates.manage',
  REPORTS_VIEW: 'reports.view',
  REPORTS_EXPORT: 'reports.export',
  REPORTS_EXPORT_IMAGES: 'reports.export_images',
  DASHBOARD_VIEW: 'dashboard.view',
  AUDIT_VIEW: 'audit.view',
  SAP_VIEW: 'sap.view',
  SAP_RETRY: 'sap.retry',
  SETTINGS_MANAGE: 'settings.manage',
} as const;

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
export const ALL_PERMISSION_CODES: PermissionCode[] = Object.values(PERMISSIONS);

export interface PermissionMeta {
  code: PermissionCode;
  groupKey: string;
  nameAr: string;
  nameEn: string;
}

const m = (code: PermissionCode, groupKey: string, nameEn: string, nameAr: string): PermissionMeta => ({
  code,
  groupKey,
  nameEn,
  nameAr,
});

export const PERMISSION_META: PermissionMeta[] = [
  m('requests.view', 'requests', 'View requests (own roles)', 'عرض الطلبات (حسب أدواري)'),
  m('requests.view_all', 'requests', 'View all requests', 'عرض كل الطلبات'),
  m('requests.act', 'requests', 'Act on requests (approve / correct / reject)', 'اتخاذ إجراء على الطلبات'),
  m('requests.edit_amounts', 'requests', 'Edit amounts', 'تعديل المبالغ'),
  m('requests.reclassify', 'requests', 'Reclassify expense type', 'تغيير نوع المصروف'),
  m('requests.create', 'requests', 'Create requests from web', 'إنشاء طلبات من الويب'),
  m('requests.force_unlock', 'requests', 'Force unlock requests', 'فك قفل الطلبات بالقوة'),
  m('vehicle_changes.view', 'fleet', 'View vehicle change requests', 'عرض طلبات تغيير السيارة'),
  m('vehicle_changes.decide', 'fleet', 'Decide vehicle change requests', 'البت في طلبات تغيير السيارة'),
  m('assignments.manage', 'fleet', 'Manage driver-vehicle assignments', 'إدارة ربط السائقين بالسيارات'),
  m('masterdata.view', 'masterdata', 'View master data', 'عرض البيانات الأساسية'),
  m('masterdata.manage', 'masterdata', 'Manage master data', 'إدارة البيانات الأساسية'),
  m('submitters.telegram_link', 'masterdata', 'Unlink Telegram accounts', 'فك ربط تليجرام'),
  m('users.view', 'admin', 'View users', 'عرض المستخدمين'),
  m('users.manage', 'admin', 'Manage users', 'إدارة المستخدمين'),
  m('roles.manage', 'admin', 'Manage roles and permissions', 'إدارة الأدوار والصلاحيات'),
  m('signatures.manage', 'admin', 'Manage signatures', 'إدارة التوقيعات'),
  m('delegations.manage_all', 'admin', 'Manage all delegations', 'إدارة كل التفويضات'),
  m('request_types.manage', 'config', 'Manage request types', 'إدارة أنواع الطلبات'),
  m('workflows.view', 'config', 'View workflows', 'عرض مسارات الموافقات'),
  m('workflows.manage', 'config', 'Manage workflows', 'إدارة مسارات الموافقات'),
  m('templates.manage', 'config', 'Manage templates', 'إدارة القوالب'),
  m('reports.view', 'reports', 'View reports', 'عرض التقارير'),
  m('reports.export', 'reports', 'Export reports', 'تصدير التقارير'),
  m('reports.export_images', 'reports', 'Export receipt images', 'تصدير صور الإيصالات'),
  m('dashboard.view', 'reports', 'View dashboard', 'عرض لوحة المتابعة'),
  m('audit.view', 'admin', 'View audit log', 'عرض سجل المراجعة'),
  m('sap.view', 'sap', 'View SAP postings', 'عرض قيود SAP'),
  m('sap.retry', 'sap', 'Retry SAP postings', 'إعادة إرسال قيود SAP'),
  m('settings.manage', 'admin', 'Manage settings', 'إدارة الإعدادات'),
];
