import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DomainError } from '@dms/core/errors';
import { hasPermission, type AuthUser } from '@dms/core/rbac';
import { AUTH_ONLY_KEY, PERMISSIONS_KEY, PUBLIC_KEY } from './decorators';

/** Fail-closed: a route with no permission metadata is rejected. */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, targets)) return true;
    const user = ctx.switchToHttp().getRequest().user as AuthUser | undefined;
    if (!user) throw new DomainError('UNAUTHENTICATED', 'Authentication required');
    if (this.reflector.getAllAndOverride<boolean>(AUTH_ONLY_KEY, targets)) return true;
    const codes = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, targets);
    if (!codes || codes.length === 0) throw new DomainError('FORBIDDEN', 'Route has no permission metadata');
    if (codes.some((c) => hasPermission(user, c))) return true;
    throw new DomainError('FORBIDDEN', 'Missing permission');
  }
}
