/**
 * Base seed (PLAN section 12, REQUIREMENTS section 10). Idempotent: every row is created by an
 * upsert keyed on its natural key and existing rows are NOT overwritten (so admin edits survive).
 *
 * DEMO LOGINS (every password is `Passw0rd!`)
 *   admin / supervisor / manager / engineer / shipping / accountant1 / accountant2 / chief / gm / treasury
 *   (role of each: SUPER_USER, CAMPAIGN_SUPERVISOR, CAMPAIGN_MANAGER, MAINTENANCE_ENGINEER,
 *    SHIPPING_OFFICER, ACCOUNTANT x2, CHIEF_ACCOUNTANT, GENERAL_MANAGER, TREASURY)
 * Drivers: DRV001..DRV010, phones +2010000000NN (NN = 01..10), no web login.
 *   DRV001 drives vehicle 2157 (cost center MLF450); DRV007 drives the STOPPED vehicle 2163;
 *   DRV008 drives vehicle 2164 (UNDER_MAINTENANCE).
 * GL numbers other than 51501800 (maintenance) and 51501500 (spare parts) are placeholders
 * (OPEN_QUESTIONS Q1); so are the treasury cash GL and company code.
 *
 * TODO(WP8): the ~30 sample requests in mixed states are created by the demo seed
 * (`packages/core/scripts/seed-demo.ts`) through the real engine. See `seedDemoHook` below.
 *
 * Run: `tsx prisma/seed.ts` (loads ../../.env, uses DATABASE_URL and STORAGE_ROOT).
 */
import { createHash } from 'node:crypto';
import { mkdir, writeFile, access } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import { PrismaClient, type Prisma } from '@prisma/client';
import { hash as argonHash } from '@node-rs/argon2';
import sharp from 'sharp';
import {
  ALL_PERMISSION_CODES,
  PERMISSION_META,
  ROLE_CODES,
  SETTING_DEFAULTS,
  SETTING_KEYS,
  checklistSchema,
  conditionSchema,
  fieldDefinitionsSchema,
  templateConfigSchema,
  type Condition,
  type FieldDefinition,
  type TemplateConfig,
} from '../../shared/src/index'; // relative: @dms/shared is not a dependency of @dms/db (see CONTRACT_NOTES)

export const DEMO_PASSWORD = 'Passw0rd!';

const here = typeof __dirname !== 'undefined' ? __dirname : dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');

type Tx = PrismaClient | Prisma.TransactionClient;

// ------------------------------------------------------------------ data tables

const DEPARTMENTS = [
  { code: 'VEH', nameAr: 'إدارة الأسطول والحملات', nameEn: 'Fleet & Campaigns' },
  { code: 'ACC', nameAr: 'الحسابات', nameEn: 'Accounting' },
  { code: 'TRS', nameAr: 'الخزينة', nameEn: 'Treasury' },
  { code: 'MGT', nameAr: 'الإدارة العليا', nameEn: 'Management' },
];

const ROLES: { code: string; nameAr: string; nameEn: string; isSuperUser?: boolean }[] = [
  { code: ROLE_CODES.SUPER_USER, nameAr: 'مدير النظام', nameEn: 'Super User', isSuperUser: true },
  { code: ROLE_CODES.CAMPAIGN_SUPERVISOR, nameAr: 'مشرف الحملة', nameEn: 'Campaign Supervisor' },
  { code: ROLE_CODES.CAMPAIGN_MANAGER, nameAr: 'مدير الحملة', nameEn: 'Campaign Manager' },
  { code: ROLE_CODES.MAINTENANCE_ENGINEER, nameAr: 'مهندس الصيانة', nameEn: 'Maintenance Engineer' },
  { code: ROLE_CODES.SHIPPING_OFFICER, nameAr: 'مسؤول الشحن', nameEn: 'Shipping Officer' },
  { code: ROLE_CODES.ACCOUNTANT, nameAr: 'محاسب', nameEn: 'Accountant' },
  { code: ROLE_CODES.CHIEF_ACCOUNTANT, nameAr: 'رئيس الحسابات', nameEn: 'Chief Accountant' },
  { code: ROLE_CODES.GENERAL_MANAGER, nameAr: 'المدير العام', nameEn: 'General Manager' },
  { code: ROLE_CODES.TREASURY, nameAr: 'الخزينة', nameEn: 'Treasury' },
];

const ACCOUNTANT_PERMS = [
  'requests.view',
  'requests.view_all',
  'requests.act',
  'requests.edit_amounts',
  'requests.reclassify',
  'masterdata.view',
  'reports.view',
  'reports.export',
  'reports.export_images',
  'sap.view',
];

const ROLE_GRANTS: Record<string, string[]> = {
  [ROLE_CODES.SUPER_USER]: [],
  [ROLE_CODES.CAMPAIGN_SUPERVISOR]: [
    'requests.view',
    'requests.act',
    'masterdata.view',
    'assignments.manage',
    'vehicle_changes.view',
  ],
  [ROLE_CODES.CAMPAIGN_MANAGER]: [
    'requests.view',
    'requests.view_all',
    'requests.act',
    'masterdata.view',
    'assignments.manage',
    'vehicle_changes.view',
    'reports.view',
    'dashboard.view',
  ],
  [ROLE_CODES.MAINTENANCE_ENGINEER]: ['requests.view', 'requests.act'],
  [ROLE_CODES.SHIPPING_OFFICER]: [
    'requests.view',
    'requests.act',
    'masterdata.view',
    'assignments.manage',
    'vehicle_changes.view',
    'vehicle_changes.decide',
  ],
  [ROLE_CODES.ACCOUNTANT]: ACCOUNTANT_PERMS,
  [ROLE_CODES.CHIEF_ACCOUNTANT]: [...ACCOUNTANT_PERMS, 'masterdata.manage', 'sap.retry', 'dashboard.view', 'audit.view'],
  [ROLE_CODES.GENERAL_MANAGER]: [
    'requests.view',
    'requests.view_all',
    'requests.act',
    'reports.view',
    'reports.export',
    'dashboard.view',
    'audit.view',
  ],
  [ROLE_CODES.TREASURY]: ['requests.view', 'requests.view_all', 'requests.act', 'sap.view', 'reports.view'],
};

const USERS: { username: string; fullName: string; fullNameEn: string; role: string; dept: string; phone: string }[] = [
  { username: 'admin', fullName: 'مدير النظام', fullNameEn: 'System Admin', role: ROLE_CODES.SUPER_USER, dept: 'MGT', phone: '+201000000101' },
  { username: 'supervisor', fullName: 'محمود السيد', fullNameEn: 'Mahmoud El-Sayed', role: ROLE_CODES.CAMPAIGN_SUPERVISOR, dept: 'VEH', phone: '+201000000102' },
  { username: 'manager', fullName: 'أحمد عبد الرحمن', fullNameEn: 'Ahmed Abdelrahman', role: ROLE_CODES.CAMPAIGN_MANAGER, dept: 'VEH', phone: '+201000000103' },
  { username: 'engineer', fullName: 'م. هشام فتحي', fullNameEn: 'Eng. Hisham Fathy', role: ROLE_CODES.MAINTENANCE_ENGINEER, dept: 'VEH', phone: '+201000000104' },
  { username: 'shipping', fullName: 'طارق منصور', fullNameEn: 'Tarek Mansour', role: ROLE_CODES.SHIPPING_OFFICER, dept: 'VEH', phone: '+201000000105' },
  { username: 'accountant1', fullName: 'سامي رمضان', fullNameEn: 'Sami Ramadan', role: ROLE_CODES.ACCOUNTANT, dept: 'ACC', phone: '+201000000106' },
  { username: 'accountant2', fullName: 'منى خليل', fullNameEn: 'Mona Khalil', role: ROLE_CODES.ACCOUNTANT, dept: 'ACC', phone: '+201000000107' },
  { username: 'chief', fullName: 'عادل حسنين', fullNameEn: 'Adel Hassanein', role: ROLE_CODES.CHIEF_ACCOUNTANT, dept: 'ACC', phone: '+201000000108' },
  { username: 'gm', fullName: 'خالد المنشاوي', fullNameEn: 'Khaled El-Menshawy', role: ROLE_CODES.GENERAL_MANAGER, dept: 'MGT', phone: '+201000000109' },
  { username: 'treasury', fullName: 'نادية صلاح', fullNameEn: 'Nadia Salah', role: ROLE_CODES.TREASURY, dept: 'TRS', phone: '+201000000110' },
];

const DRIVER_NAMES = [
  'محمد إبراهيم',
  'علي حسن',
  'مصطفى كمال',
  'إسلام جمال',
  'عمرو فاروق',
  'حسام الدين',
  'ياسر عبد الله',
  'كريم نبيل',
  'سعيد مختار',
  'وليد صبحي',
];

const VEHICLE_TYPES = [
  { code: 'TRUCK', nameAr: 'شاحنة نقل ثقيل', nameEn: 'Heavy truck' },
  { code: 'PICKUP', nameAr: 'نقل ربع', nameEn: 'Pickup' },
  { code: 'VAN', nameAr: 'ميكروباص / فان', nameEn: 'Van' },
];

const COST_CENTERS = [
  { code: 'MLF450', name: 'Mainline Fleet 450' },
  { code: 'MLF451', name: 'Mainline Fleet 451' },
  { code: 'DST100', name: 'Distribution 100' },
  { code: 'ADM200', name: 'Administration 200' },
];

// 51501800 / 51501500 are real (REQUIREMENTS); the rest are placeholders (OPEN_QUESTIONS Q1).
const GL_ACCOUNTS = [
  { number: '51501800', nameAr: 'مصروفات صيانة', nameEn: 'Maintenance expenses' },
  { number: '51501500', nameAr: 'مصروفات قطع غيار', nameEn: 'Spare parts expenses' },
  { number: '51501100', nameAr: 'مصروفات رسوم طرق', nameEn: 'Road tolls' },
  { number: '51501200', nameAr: 'مصروفات ميزان', nameEn: 'Weighbridge' },
  { number: '51501300', nameAr: 'مصروفات مخالفات مرور', nameEn: 'Traffic fines' },
  { number: '51501400', nameAr: 'مصروفات وقود', nameEn: 'Fuel / diesel' },
  { number: '51501600', nameAr: 'مصروفات إكراميات', nameEn: 'Tips' },
  { number: '51501900', nameAr: 'مصروفات نقل أخرى', nameEn: 'Other transport expenses' },
];

const DIESEL_FIELDS: FieldDefinition[] = [
  {
    key: 'liters',
    labelAr: 'عدد اللترات',
    labelEn: 'Liters',
    type: 'number',
    required: true,
    min: 1,
    max: 1000,
    promptAr: 'اكتب عدد اللترات',
    order: 1,
  },
];

interface ExpenseTypeSeed {
  code: string;
  nameAr: string;
  nameEn: string;
  icon: string;
  gl: string;
  roles?: string[];
  extraFields?: FieldDefinition[];
  quantityFieldKey?: string;
  unitPriceMin?: number;
  unitPriceMax?: number;
}

const EXPENSE_TYPES: ExpenseTypeSeed[] = [
  { code: 'TOLLS', nameAr: 'رسوم طرق', nameEn: 'Road tolls', icon: '🛣️', gl: '51501100' },
  { code: 'WEIGHBRIDGE', nameAr: 'ميزان', nameEn: 'Weighbridge', icon: '⚖️', gl: '51501200' },
  { code: 'FINES', nameAr: 'مخالفات', nameEn: 'Traffic fines', icon: '🚨', gl: '51501300' },
  { code: 'MAINTENANCE', nameAr: 'صيانة', nameEn: 'Maintenance', icon: '🔧', gl: '51501800', roles: [ROLE_CODES.MAINTENANCE_ENGINEER] },
  { code: 'SPARE_PARTS', nameAr: 'قطع غيار', nameEn: 'Spare parts', icon: '⚙️', gl: '51501500', roles: [ROLE_CODES.MAINTENANCE_ENGINEER] },
  {
    code: 'DIESEL',
    nameAr: 'سولار',
    nameEn: 'Diesel',
    icon: '⛽',
    gl: '51501400',
    extraFields: DIESEL_FIELDS,
    quantityFieldKey: 'liters',
    unitPriceMin: 8,
    unitPriceMax: 40,
  },
  { code: 'TIPS', nameAr: 'إكراميات', nameEn: 'Tips', icon: '💵', gl: '51501600', roles: [ROLE_CODES.SHIPPING_OFFICER] },
  { code: 'OTHER', nameAr: 'أخرى', nameEn: 'Other', icon: '📝', gl: '51501900' },
];

// vehicle index i (0..9) <-> driver DRV00(i+1)
const VEHICLES: { number: string; plate: string; type: string; cc: string; status: 'ACTIVE' | 'STOPPED' | 'UNDER_MAINTENANCE' }[] = [
  { number: '2157', plate: 'ن ق ل 2157', type: 'TRUCK', cc: 'MLF450', status: 'ACTIVE' },
  { number: '2158', plate: 'ن ق ل 2158', type: 'TRUCK', cc: 'MLF450', status: 'ACTIVE' },
  { number: '2159', plate: 'ن ق ل 2159', type: 'TRUCK', cc: 'MLF451', status: 'ACTIVE' },
  { number: '2160', plate: 'ص ل ب 2160', type: 'PICKUP', cc: 'MLF451', status: 'ACTIVE' },
  { number: '2161', plate: 'ص ل ب 2161', type: 'PICKUP', cc: 'DST100', status: 'ACTIVE' },
  { number: '2162', plate: 'ع ك م 2162', type: 'VAN', cc: 'DST100', status: 'ACTIVE' },
  { number: '2163', plate: 'ن ق ل 2163', type: 'TRUCK', cc: 'MLF450', status: 'STOPPED' },
  { number: '2164', plate: 'ن ق ل 2164', type: 'TRUCK', cc: 'MLF451', status: 'UNDER_MAINTENANCE' },
  { number: '2165', plate: 'ص ل ب 2165', type: 'PICKUP', cc: 'DST100', status: 'ACTIVE' },
  { number: '2166', plate: 'ع ك م 2166', type: 'VAN', cc: 'ADM200', status: 'ACTIVE' },
];

const HEADER_FIELDS: FieldDefinition[] = [
  {
    key: 'odometer',
    labelAr: 'قراءة العداد',
    labelEn: 'Odometer reading',
    type: 'number',
    required: true,
    min: 0,
    promptAr: 'اكتب قراءة العداد الحالية',
    order: 1,
  },
];

const WORKFLOW_STEPS: {
  key: string;
  role: string | null;
  nameAr: string;
  nameEn: string;
  group: string | null;
  condition: Condition;
  stepType?: 'ROLE' | 'DYNAMIC_CATEGORY_ROLES';
  kind?: 'APPROVAL' | 'PAYMENT';
  canEdit?: boolean;
  checklist?: unknown[];
  sla: number;
}[] = [
  {
    key: 'supervisor',
    role: ROLE_CODES.CAMPAIGN_SUPERVISOR,
    nameAr: 'مشرف الحملة',
    nameEn: 'Campaign Supervisor',
    group: null,
    condition: { type: 'ALWAYS' },
    checklist: [
      {
        key: 'receipts_match',
        labelAr: 'تم استلام الإيصالات الأصلية وهي مطابقة',
        labelEn: 'Physical receipts received and match',
        required: true,
      },
    ],
    sla: 24,
  },
  {
    key: 'maintenance_engineer',
    role: ROLE_CODES.MAINTENANCE_ENGINEER,
    nameAr: 'مهندس الصيانة',
    nameEn: 'Maintenance Engineer',
    group: 'extra',
    condition: { type: 'LINE_CATEGORY_REQUIRES_ROLE' },
    sla: 24,
  },
  {
    key: 'shipping_officer',
    role: ROLE_CODES.SHIPPING_OFFICER,
    nameAr: 'مسؤول الشحن',
    nameEn: 'Shipping Officer',
    group: 'extra',
    condition: { type: 'LINE_CATEGORY_REQUIRES_ROLE' },
    sla: 24,
  },
  {
    key: 'extra_roles',
    role: null,
    nameAr: 'موافقات إضافية',
    nameEn: 'Additional approvals',
    group: 'extra',
    condition: { type: 'ALWAYS' },
    stepType: 'DYNAMIC_CATEGORY_ROLES',
    sla: 24,
  },
  { key: 'campaign_manager', role: ROLE_CODES.CAMPAIGN_MANAGER, nameAr: 'مدير الحملة', nameEn: 'Campaign Manager', group: null, condition: { type: 'ALWAYS' }, sla: 24 },
  { key: 'accountant', role: ROLE_CODES.ACCOUNTANT, nameAr: 'المحاسب', nameEn: 'Accountant', group: null, condition: { type: 'ALWAYS' }, canEdit: true, sla: 48 },
  { key: 'chief_accountant', role: ROLE_CODES.CHIEF_ACCOUNTANT, nameAr: 'رئيس الحسابات', nameEn: 'Chief Accountant', group: null, condition: { type: 'ALWAYS' }, canEdit: true, sla: 48 },
  { key: 'general_manager', role: ROLE_CODES.GENERAL_MANAGER, nameAr: 'المدير العام', nameEn: 'General Manager', group: null, condition: { type: 'ALWAYS' }, sla: 48 },
  { key: 'treasury', role: ROLE_CODES.TREASURY, nameAr: 'الخزينة', nameEn: 'Treasury', group: null, condition: { type: 'ALWAYS' }, kind: 'PAYMENT', sla: 24 },
];

/**
 * Template config v1. Header field keys are interpreted by the PDF layout (WP4):
 * requestNumber, submittedAt, submitterName, vehicleNumber, vehicleType, costCenter, odometer.
 */
const TEMPLATE_CONFIG: TemplateConfig = {
  titleAr: 'كشف مصاريف',
  titleEn: 'Expense Sheet',
  headerFields: [
    { key: 'requestNumber', labelAr: 'رقم الطلب', labelEn: 'Request No.', show: true },
    { key: 'submittedAt', labelAr: 'التاريخ', labelEn: 'Date', show: true },
    { key: 'submitterName', labelAr: 'اسم السائق', labelEn: 'Driver', show: true },
    { key: 'vehicleNumber', labelAr: 'رقم السيارة', labelEn: 'Vehicle No.', show: true },
    { key: 'vehicleType', labelAr: 'نوع السيارة', labelEn: 'Vehicle type', show: true },
    { key: 'costCenter', labelAr: 'مركز التكلفة', labelEn: 'Cost center', show: true },
    { key: 'odometer', labelAr: 'قراءة العداد', labelEn: 'Odometer', show: true },
  ],
  lineColumns: [
    { key: 'category', labelAr: 'نوع المصروف', show: true },
    { key: 'originalAmount', labelAr: 'المبلغ الأصلي', show: true },
    { key: 'amount', labelAr: 'المبلغ', show: true },
    { key: 'quantity', labelAr: 'الكمية', show: true },
    { key: 'unitPrice', labelAr: 'سعر الوحدة', show: true },
    { key: 'note', labelAr: 'ملاحظات', show: false },
  ],
  showOriginalValues: true,
  showAmountInWords: true,
  signature: { perRow: 4, showDateTime: true, submitterLabelAr: 'السائق' },
};

// ------------------------------------------------------------------ signatures

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic scribble-like signature, 400x150 transparent PNG. */
export async function generateSignaturePng(seed: string): Promise<Buffer> {
  let h = hashSeed(seed);
  const rnd = () => {
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
    return h / 4294967296;
  };
  let x = 25;
  let y = 85;
  let d = `M ${x} ${y}`;
  for (let i = 0; i < 9; i++) {
    const cx1 = x + 15 + rnd() * 20;
    const cy1 = 30 + rnd() * 90;
    const x2 = x + 30 + rnd() * 18;
    const y2 = 50 + rnd() * 70;
    d += ` Q ${cx1.toFixed(1)} ${cy1.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
    x = x2;
    y = y2;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="150" viewBox="0 0 400 150">
<path d="${d}" fill="none" stroke="#1a2a6c" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M 20 128 L ${Math.min(x + 15, 385).toFixed(1)} 118" fill="none" stroke="#1a2a6c" stroke-width="2" stroke-linecap="round"/>
</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

const SEED_SIG_NAME = 'seed-v1.png';
const sigKey = (ownerId: string) => `signatures/${ownerId}/${SEED_SIG_NAME}`;

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Materializes the seeded signature PNG files under `root` for every seeded Signature row.
 * Needed after cloning the template DB (rows exist, files do not). Idempotent.
 */
export async function seedSignatureFiles(root: string, prisma: Tx): Promise<number> {
  const rows = await prisma.signature.findMany({ where: { storageKey: { endsWith: `/${SEED_SIG_NAME}` } } });
  let written = 0;
  for (const r of rows) {
    const file = join(root, r.storageKey);
    if (await exists(file)) continue;
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, await generateSignaturePng(r.userId ?? r.submitterId ?? r.id));
    written++;
  }
  return written;
}

// ------------------------------------------------------------------ seed

export interface SeedOptions {
  /** where signature PNGs are written; default STORAGE_ROOT or <repo>/storage-data */
  storageRoot?: string;
  /** skip writing files (DB rows only) */
  skipFiles?: boolean;
}

export async function seedBase(prisma: PrismaClient, opts: SeedOptions = {}): Promise<void> {
  const storageRoot = resolve(
    repoRoot,
    opts.storageRoot ?? process.env.STORAGE_ROOT ?? './storage-data',
  );

  // --- departments
  const dept: Record<string, string> = {};
  for (const d of DEPARTMENTS) {
    const row = await prisma.department.upsert({ where: { code: d.code }, create: d, update: {} });
    dept[d.code] = row.id;
  }

  // --- permissions (metadata is refreshed on every run)
  for (const [i, p] of PERMISSION_META.entries()) {
    await prisma.permission.upsert({
      where: { code: p.code },
      create: { code: p.code, groupKey: p.groupKey, nameAr: p.nameAr, nameEn: p.nameEn, sortOrder: i },
      update: { groupKey: p.groupKey, nameAr: p.nameAr, nameEn: p.nameEn, sortOrder: i },
    });
  }
  if (PERMISSION_META.length !== ALL_PERMISSION_CODES.length) throw new Error('PERMISSION_META out of sync');

  // --- roles + grants
  const roleId: Record<string, string> = {};
  for (const r of ROLES) {
    const row = await prisma.role.upsert({
      where: { code: r.code },
      create: { code: r.code, nameAr: r.nameAr, nameEn: r.nameEn, isSuperUser: !!r.isSuperUser, isSystem: true },
      update: {},
    });
    roleId[r.code] = row.id;
    const grants = ROLE_GRANTS[r.code] ?? [];
    if (grants.length) {
      await prisma.rolePermission.createMany({
        data: grants.map((permissionCode) => ({ roleId: row.id, permissionCode })),
        skipDuplicates: true,
      });
    }
  }

  // --- users (password hashed only on creation)
  const userId: Record<string, string> = {};
  for (const u of USERS) {
    let row = await prisma.user.findUnique({ where: { username: u.username } });
    if (!row) {
      row = await prisma.user.create({
        data: {
          username: u.username,
          passwordHash: await argonHash(DEMO_PASSWORD),
          fullName: u.fullName,
          fullNameEn: u.fullNameEn,
          phone: u.phone,
          email: `${u.username}@example.test`,
          departmentId: dept[u.dept],
        },
      });
    }
    userId[u.username] = row.id;
    await prisma.userRole.createMany({ data: [{ userId: row.id, roleId: roleId[u.role] }], skipDuplicates: true });
  }

  // --- settings (create only when missing)
  for (const key of SETTING_KEYS) {
    await prisma.setting.upsert({
      where: { key },
      create: { key, value: SETTING_DEFAULTS[key] as unknown as Prisma.InputJsonValue },
      update: {},
    });
  }

  // --- request type
  const requestType = await prisma.requestType.upsert({
    where: { code: 'DRIVER_EXPENSE' },
    create: {
      code: 'DRIVER_EXPENSE',
      nameAr: 'مصروفات السائقين',
      nameEn: 'Driver Expenses',
      departmentId: dept.VEH,
      numberPrefix: 'DE',
      moduleKey: 'expense',
      headerFields: fieldDefinitionsSchema.parse(HEADER_FIELDS) as unknown as Prisma.InputJsonValue,
      hasLines: true,
      channels: ['TELEGRAM', 'WEB'],
    },
    update: {},
  });

  // --- master data: vehicle types, cost centers, GL accounts
  const vtId: Record<string, string> = {};
  for (const v of VEHICLE_TYPES) {
    vtId[v.code] = (await prisma.vehicleType.upsert({ where: { code: v.code }, create: v, update: {} })).id;
  }
  const ccId: Record<string, string> = {};
  for (const c of COST_CENTERS) {
    ccId[c.code] = (await prisma.costCenter.upsert({ where: { code: c.code }, create: c, update: {} })).id;
  }
  const glId: Record<string, string> = {};
  for (const g of GL_ACCOUNTS) {
    glId[g.number] = (await prisma.glAccount.upsert({ where: { number: g.number }, create: g, update: {} })).id;
  }

  // --- expense types = line categories + GL config + approval roles
  for (const [i, e] of EXPENSE_TYPES.entries()) {
    const cat = await prisma.lineCategory.upsert({
      where: { requestTypeId_code: { requestTypeId: requestType.id, code: e.code } },
      create: {
        requestTypeId: requestType.id,
        code: e.code,
        nameAr: e.nameAr,
        nameEn: e.nameEn,
        icon: e.icon,
        sortOrder: (i + 1) * 10,
        extraFields: fieldDefinitionsSchema.parse(e.extraFields ?? []) as unknown as Prisma.InputJsonValue,
        quantityFieldKey: e.quantityFieldKey ?? null,
        unitPriceMin: e.unitPriceMin ?? null,
        unitPriceMax: e.unitPriceMax ?? null,
        minAttachments: 1,
        maxAttachments: 10,
      },
      update: {},
    });
    await prisma.expenseTypeConfig.upsert({
      where: { lineCategoryId: cat.id },
      create: { lineCategoryId: cat.id, glAccountId: glId[e.gl] },
      update: {},
    });
    for (const rc of e.roles ?? []) {
      await prisma.lineCategoryApprovalRole.createMany({
        data: [{ lineCategoryId: cat.id, roleId: roleId[rc] }],
        skipDuplicates: true,
      });
    }
  }

  // --- vehicles
  const vehicleId: Record<string, string> = {};
  for (const v of VEHICLES) {
    const row = await prisma.vehicle.upsert({
      where: { number: v.number },
      create: {
        number: v.number,
        plateNumber: v.plate,
        vehicleTypeId: vtId[v.type],
        costCenterId: ccId[v.cc],
        status: v.status,
      },
      update: {},
    });
    vehicleId[v.number] = row.id;
  }

  // --- drivers (+ open assignments)
  const driverIds: string[] = [];
  for (let i = 0; i < 10; i++) {
    const nn = String(i + 1).padStart(2, '0');
    const code = `DRV0${nn}`;
    const row = await prisma.submitter.upsert({
      where: { code },
      create: {
        kind: 'DRIVER',
        code,
        fullName: DRIVER_NAMES[i],
        phone: `+2010000000${nn}`,
        departmentId: dept.VEH,
      },
      update: {},
    });
    driverIds.push(row.id);
    const open = await prisma.driverVehicleAssignment.findFirst({ where: { submitterId: row.id, validTo: null } });
    if (!open) {
      await prisma.driverVehicleAssignment.create({
        data: {
          submitterId: row.id,
          vehicleId: vehicleId[VEHICLES[i].number],
          source: 'MANUAL',
          note: 'seed',
          createdById: userId.admin,
        },
      });
    }
  }

  // --- default treasury
  await prisma.treasury.upsert({
    where: { code: 'MAIN' },
    create: {
      code: 'MAIN',
      name: 'الخزينة الرئيسية',
      cashGlNumber: '11001000', // placeholder (OPEN_QUESTIONS Q1)
      companyCode: '1000',
      isDefault: true,
    },
    update: {},
  });

  // --- template v1
  const template = await prisma.template.upsert({
    where: { requestTypeId_code: { requestTypeId: requestType.id, code: 'EXPENSE_SHEET' } },
    create: {
      requestTypeId: requestType.id,
      code: 'EXPENSE_SHEET',
      nameAr: 'كشف مصاريف',
      nameEn: 'Expense sheet',
      isDefault: true,
    },
    update: {},
  });
  await prisma.templateVersion.upsert({
    where: { templateId_version: { templateId: template.id, version: 1 } },
    create: {
      templateId: template.id,
      version: 1,
      status: 'ACTIVE',
      layoutKey: 'expense-sheet',
      config: templateConfigSchema.parse(TEMPLATE_CONFIG) as unknown as Prisma.InputJsonValue,
      note: 'seed',
      createdById: userId.admin,
      publishedById: userId.admin,
      publishedAt: new Date(),
    },
    update: {},
  });

  // --- workflow v1
  const workflow = await prisma.workflow.upsert({
    where: { requestTypeId: requestType.id },
    create: { requestTypeId: requestType.id, nameAr: 'مسار مصروفات السائقين', nameEn: 'Driver expenses workflow' },
    update: {},
  });
  const wfVersion = await prisma.workflowVersion.upsert({
    where: { workflowId_version: { workflowId: workflow.id, version: 1 } },
    create: {
      workflowId: workflow.id,
      version: 1,
      status: 'ACTIVE',
      note: 'seed',
      createdById: userId.admin,
      publishedById: userId.admin,
      publishedAt: new Date(),
    },
    update: {},
  });
  for (const [i, s] of WORKFLOW_STEPS.entries()) {
    await prisma.workflowStep.upsert({
      where: { workflowVersionId_key: { workflowVersionId: wfVersion.id, key: s.key } },
      create: {
        workflowVersionId: wfVersion.id,
        key: s.key,
        sortOrder: (i + 1) * 10,
        stepType: s.stepType ?? 'ROLE',
        kind: s.kind ?? 'APPROVAL',
        nameAr: s.nameAr,
        nameEn: s.nameEn,
        roleId: s.role ? roleId[s.role] : null,
        parallelGroup: s.group,
        condition: conditionSchema.parse(s.condition) as unknown as Prisma.InputJsonValue,
        canEditAmounts: !!s.canEdit,
        canReclassify: !!s.canEdit,
        checklist: checklistSchema.parse(s.checklist ?? []) as unknown as Prisma.InputJsonValue,
        slaHours: s.sla,
      },
      update: {},
    });
  }

  // --- signatures (rows + files)
  const owners: { userId?: string; submitterId?: string }[] = [
    ...Object.values(userId).map((id) => ({ userId: id })),
    ...driverIds.map((id) => ({ submitterId: id })),
  ];
  for (const o of owners) {
    const ownerId = (o.userId ?? o.submitterId)!;
    const active = await prisma.signature.findFirst({
      where: o.userId ? { userId: o.userId, isActive: true } : { submitterId: o.submitterId, isActive: true },
    });
    if (active) continue;
    const png = await generateSignaturePng(ownerId);
    await prisma.signature.upsert({
      where: { storageKey: sigKey(ownerId) },
      create: {
        userId: o.userId ?? null,
        submitterId: o.submitterId ?? null,
        storageKey: sigKey(ownerId),
        sha256: createHash('sha256').update(png).digest('hex'),
        width: 400,
        height: 150,
        uploadedById: userId.admin,
      },
      update: {},
    });
  }
  if (!opts.skipFiles) await seedSignatureFiles(storageRoot, prisma);
}

/**
 * Hook for WP8: the demo seed (~30 requests in mixed states, created through the engine) runs
 * after the base seed via `pnpm --filter @dms/core seed:demo`. Nothing to do here.
 */
export async function seedDemoHook(): Promise<void> {
  // TODO(WP8): see packages/core/scripts/seed-demo.ts
}

async function main() {
  loadDotenv({ path: resolve(repoRoot, '.env') });
  const prisma = new PrismaClient();
  try {
    await seedBase(prisma);
    await seedDemoHook();
    console.log('Base seed done. Demo logins: admin, supervisor, manager, engineer, shipping, accountant1, accountant2, chief, gm, treasury / ' + DEMO_PASSWORD);
  } finally {
    await prisma.$disconnect();
  }
}

const entry = process.argv[1] ? resolve(process.argv[1]) : '';
if (entry === resolve(here, 'seed.ts') || entry === resolve(here, 'seed.js')) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
