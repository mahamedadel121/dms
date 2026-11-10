import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import type { AuthUser } from '@dms/core/rbac';

export const PUBLIC_KEY = 'dms:public';
export const AUTH_ONLY_KEY = 'dms:authOnly';
export const PERMISSIONS_KEY = 'dms:permissions';

/** No authentication required. */
export const Public = () => SetMetadata(PUBLIC_KEY, true);
/** Any authenticated user. */
export const AuthOnly = () => SetMetadata(AUTH_ONLY_KEY, true);
/** Authenticated user holding ANY of the listed permission codes. */
export const RequirePermission = (...codes: string[]) => SetMetadata(PERMISSIONS_KEY, codes);

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user as AuthUser;
});
