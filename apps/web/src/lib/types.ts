/** Shapes shared by the web shell. Mirrors PLAN §11 (`Me`, list envelope). */
export interface EffectiveRoleDto {
  roleId: string;
  code: string;
  nameAr: string;
  nameEn: string;
  scopeDepartmentId: string | null;
  isSuperUser: boolean;
  viaDelegationId?: string;
  onBehalfOfUserId?: string;
}

export interface Me {
  id: string;
  username: string;
  fullName: string;
  locale: string;
  departmentId: string | null;
  isSuperUser: boolean;
  roles: EffectiveRoleDto[];
  permissions: string[];
  hasSignature: boolean;
  mustChangePassword?: boolean;
  telegramLinked?: boolean;
}

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

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn?: number;
}
