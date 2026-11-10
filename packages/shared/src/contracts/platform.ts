// Contract file owned by WP1 (platform API bodies/responses). PLAN §11.
import { z } from 'zod';
import type { EffectiveRole } from '../types/auth';

// ---------- common ----------
export const platformPageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  sort: z.string().optional(), // "field:desc"
  q: z.string().optional(),
});
export type PageQuery = z.infer<typeof platformPageQuerySchema>;

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface LookupItem {
  id: string;
  code: string;
  label: string;
}

export const LOOKUP_ENTITIES = [
  'roles',
  'users',
  'departments',
  'submitters',
  'vehicles',
  'vehicle-types',
  'cost-centers',
  'gl-accounts',
  'expense-types',
  'treasuries',
  'request-types',
] as const;
export type LookupEntity = (typeof LOOKUP_ENTITIES)[number];

// ---------- auth ----------
export const loginSchema = z.object({ username: z.string().min(1), password: z.string().min(1) });
export type LoginInput = z.infer<typeof loginSchema>;
export const refreshSchema = z.object({ refreshToken: z.string().min(10) });
export type RefreshInput = z.infer<typeof refreshSchema>;
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export interface Me {
  id: string;
  username: string;
  fullName: string;
  locale: string;
  departmentId: string | null;
  isSuperUser: boolean;
  roles: EffectiveRole[];
  permissions: string[];
  hasSignature: boolean;
  mustChangePassword: boolean;
}
export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: Me;
}
export interface SessionInfo {
  id: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  current: boolean;
}

// ---------- users ----------
export interface UserRow {
  id: string;
  username: string;
  fullName: string;
  fullNameEn: string | null;
  phone: string | null;
  email: string | null;
  departmentId: string | null;
  departmentName: string | null;
  locale: string;
  isActive: boolean;
  mustChangePassword: boolean;
  lockedUntil: string | null;
  lastLoginAt: string | null;
  telegramLinked: boolean;
  roleIds: string[];
  roles: { id: string; code: string; nameAr: string; nameEn: string }[];
  hasSignature: boolean;
  createdAt: string;
}
export const userCreateSchema = z.object({
  username: z
    .string()
    .min(3)
    .max(64)
    .regex(/^[A-Za-z0-9._-]+$/),
  password: z.string().min(8).max(128),
  fullName: z.string().min(1),
  fullNameEn: z.string().nullish(),
  phone: z.string().nullish(),
  email: z.string().email().nullish(),
  departmentId: z.string().nullish(),
  locale: z.enum(['ar', 'en']).default('ar'),
  mustChangePassword: z.boolean().default(false),
  roleIds: z.array(z.string()).default([]),
});
export type UserCreateInput = z.infer<typeof userCreateSchema>;
export const userUpdateSchema = z.object({
  fullName: z.string().min(1).optional(),
  fullNameEn: z.string().nullish(),
  phone: z.string().nullish(),
  email: z.string().email().nullish(),
  departmentId: z.string().nullish(),
  locale: z.enum(['ar', 'en']).optional(),
  isActive: z.boolean().optional(),
  mustChangePassword: z.boolean().optional(),
});
export type UserUpdateInput = z.infer<typeof userUpdateSchema>;
export const userRolesSchema = z.object({ roleIds: z.array(z.string()) });
export type UserRolesInput = z.infer<typeof userRolesSchema>;
export const resetPasswordSchema = z.object({
  newPassword: z.string().min(8).max(128).optional(), // omitted => generated and returned
  mustChangePassword: z.boolean().default(true),
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export interface ResetPasswordResult {
  temporaryPassword: string | null;
}

// ---------- roles / matrix ----------
export interface RoleRow {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  description: string | null;
  scopeDepartmentId: string | null;
  isSuperUser: boolean;
  isSystem: boolean;
  isActive: boolean;
  userCount: number;
}
export const roleCreateSchema = z.object({
  code: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[A-Z0-9_]+$/),
  nameAr: z.string().min(1),
  nameEn: z.string().min(1),
  description: z.string().nullish(),
  scopeDepartmentId: z.string().nullish(),
  permissionCodes: z.array(z.string()).default([]),
});
export type RoleCreateInput = z.infer<typeof roleCreateSchema>;
export const roleUpdateSchema = z.object({
  nameAr: z.string().min(1).optional(),
  nameEn: z.string().min(1).optional(),
  description: z.string().nullish(),
  scopeDepartmentId: z.string().nullish(),
  isActive: z.boolean().optional(),
});
export type RoleUpdateInput = z.infer<typeof roleUpdateSchema>;
export const rolePermissionsSchema = z.object({ codes: z.array(z.string()) });
export type RolePermissionsInput = z.infer<typeof rolePermissionsSchema>;
export interface PermissionRow {
  code: string;
  groupKey: string;
  nameAr: string;
  nameEn: string;
  sortOrder: number;
}
export interface PermissionMatrix {
  roles: RoleRow[];
  permissions: PermissionRow[];
  grants: Record<string, string[]>; // roleId -> codes
}

// ---------- delegations ----------
export interface DelegationRow {
  id: string;
  fromUserId: string;
  fromUserName: string;
  toUserId: string;
  toUserName: string;
  roleId: string | null;
  roleName: string | null;
  startsAt: string;
  endsAt: string;
  reason: string | null;
  revokedAt: string | null;
  status: 'UPCOMING' | 'ACTIVE' | 'EXPIRED' | 'REVOKED';
  createdAt: string;
}
export const delegationCreateSchema = z
  .object({
    toUserId: z.string(),
    roleId: z.string().nullish(),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    reason: z.string().nullish(),
    fromUserId: z.string().optional(),
  })
  .refine((v) => v.endsAt > v.startsAt, { message: 'endsAt must be after startsAt', path: ['endsAt'] });
export type DelegationCreateInput = z.infer<typeof delegationCreateSchema>;

// ---------- audit ----------
export const auditQuerySchema = platformPageQuerySchema.extend({
  entityType: z.string().optional(),
  entityId: z.string().optional(),
  actorUserId: z.string().optional(),
  action: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export type AuditQuery = z.infer<typeof auditQuerySchema>;
export interface AuditRow {
  id: string;
  createdAt: string;
  actorType: 'USER' | 'SUBMITTER' | 'SYSTEM';
  actorUserId: string | null;
  actorLabel: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
  meta: unknown;
  ip: string | null;
}

// ---------- settings ----------
export interface SettingRow {
  key: string;
  value: unknown;
  updatedAt: string | null;
}
export const settingUpdateSchema = z.object({ value: z.unknown() });
export type SettingUpdateInput = z.infer<typeof settingUpdateSchema>;

// ---------- notifications ----------
export interface NotificationRow {
  id: string;
  type: string;
  requestId: string | null;
  titleAr: string | null;
  titleEn: string | null;
  bodyAr: string;
  bodyEn: string | null;
  data: unknown;
  readAt: string | null;
  createdAt: string;
}

// ---------- signatures ----------
export interface SignatureRow {
  id: string;
  url: string;
  isActive: boolean;
  width: number | null;
  height: number | null;
  createdAt: string;
  deactivatedAt: string | null;
}
export interface SignatureUploadResult {
  signatureId: string;
  url: string;
}
export interface SignatureInfo {
  current: SignatureRow | null;
  history: SignatureRow[];
}

// ---------- master data ----------
export const MASTER_RESOURCES = [
  'departments',
  'submitters',
  'vehicle-types',
  'cost-centers',
  'gl-accounts',
  'vehicles',
  'treasuries',
  'expense-types',
] as const;
export type MasterResource = (typeof MASTER_RESOURCES)[number];

export const masterListQuerySchema = platformPageQuerySchema.extend({
  active: z.enum(['1', '0']).optional(),
  status: z.string().optional(), // vehicles
  vehicleTypeId: z.string().optional(),
  costCenterId: z.string().optional(),
  departmentId: z.string().optional(),
});
export type MasterListQuery = z.infer<typeof masterListQuerySchema>;

export const departmentInputSchema = z.object({
  code: z.string().min(1),
  nameAr: z.string().min(1),
  nameEn: z.string().min(1),
  isActive: z.boolean().optional(),
});
export const submitterInputSchema = z.object({
  kind: z.string().default('DRIVER'),
  code: z.string().min(1),
  fullName: z.string().min(1),
  nationalId: z.string().nullish(),
  phone: z.string().min(5),
  departmentId: z.string().nullish(),
  notes: z.string().nullish(),
  isActive: z.boolean().optional(),
});
export const vehicleTypeInputSchema = z.object({
  code: z.string().min(1),
  nameAr: z.string().min(1),
  nameEn: z.string().min(1),
  isActive: z.boolean().optional(),
});
export const costCenterInputSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  isActive: z.boolean().optional(),
});
export const glAccountInputSchema = z.object({
  number: z.string().min(1),
  nameAr: z.string().min(1),
  nameEn: z.string().min(1),
  isActive: z.boolean().optional(),
});
export const vehicleInputSchema = z.object({
  number: z.string().min(1),
  plateNumber: z.string().nullish(),
  vehicleTypeId: z.string(),
  costCenterId: z.string(),
  status: z.enum(['ACTIVE', 'STOPPED', 'UNDER_MAINTENANCE']).default('ACTIVE'),
  notes: z.string().nullish(),
  isActive: z.boolean().optional(),
});
export const treasuryInputSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  cashGlNumber: z.string().min(1),
  companyCode: z.string().min(1),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
});
const decimalStr = z.union([z.string(), z.number()]).transform((v) => String(v));
export const expenseTypeInputSchema = z.object({
  code: z.string().min(1),
  nameAr: z.string().min(1),
  nameEn: z.string().min(1),
  icon: z.string().nullish(),
  sortOrder: z.number().int().default(0),
  glAccountId: z.string(),
  extraFields: z.array(z.record(z.unknown())).default([]),
  quantityFieldKey: z.string().nullish(),
  unitPriceMin: decimalStr.nullish(),
  unitPriceMax: decimalStr.nullish(),
  minAttachments: z.number().int().min(0).default(1),
  maxAttachments: z.number().int().min(1).default(10),
  maxAmountWarning: decimalStr.nullish(),
  approvalRoleIds: z.array(z.string()).default([]),
  isActive: z.boolean().optional(),
});
export type ExpenseTypeInput = z.infer<typeof expenseTypeInputSchema>;
export const masterInputSchemas = {
  departments: departmentInputSchema,
  submitters: submitterInputSchema,
  'vehicle-types': vehicleTypeInputSchema,
  'cost-centers': costCenterInputSchema,
  'gl-accounts': glAccountInputSchema,
  vehicles: vehicleInputSchema,
  treasuries: treasuryInputSchema,
  'expense-types': expenseTypeInputSchema,
} as const;

export interface ImportResult {
  created: number;
  updated: number;
  errors: { row: number; message: string }[];
  dryRun: boolean;
}

// ---------- assignments / vehicle changes ----------
export const assignmentCreateSchema = z.object({
  submitterId: z.string(),
  vehicleId: z.string(),
  note: z.string().nullish(),
});
export type AssignmentCreateInput = z.infer<typeof assignmentCreateSchema>;
export interface AssignmentRow {
  id: string;
  submitterId: string;
  submitterName: string;
  submitterCode: string;
  vehicleId: string;
  vehicleNumber: string;
  validFrom: string;
  validTo: string | null;
  source: 'MANUAL' | 'CHANGE_REQUEST' | 'IMPORT';
  note: string | null;
}
export interface CurrentAssignmentsResult {
  assignments: AssignmentRow[];
  unassignedVehicles: { id: string; number: string; status: string }[];
  stoppedVehicles: { id: string; number: string; status: string }[];
  driversWithoutVehicle: { id: string; code: string; fullName: string }[];
}
export const decisionSchema = z.object({ comment: z.string().nullish(), toVehicleId: z.string().optional() });
export type DecisionInput = z.infer<typeof decisionSchema>;
export interface VehicleChangeRow {
  id: string;
  submitterId: string;
  submitterName: string;
  fromVehicleId: string | null;
  fromVehicleNumber: string | null;
  toVehicleId: string | null;
  toVehicleNumber: string | null;
  requestedVehicleText: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  decidedByName: string | null;
  decidedAt: string | null;
  decisionComment: string | null;
  createdAt: string;
}
