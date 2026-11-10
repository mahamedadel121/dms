export interface EffectiveRole {
  roleId: string;
  code: string;
  nameAr: string;
  nameEn: string;
  scopeDepartmentId: string | null;
  isSuperUser: boolean;
  viaDelegationId?: string;
  onBehalfOfUserId?: string;
}

export interface AuthUser {
  id: string;
  username: string;
  fullName: string;
  departmentId: string | null;
  isSuperUser: boolean;
  permissions: string[];
  roles: EffectiveRole[];
}
