import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DomainError } from '@dms/core/errors';
import { loadAuthUser } from '@dms/core/rbac';
import { PrismaService } from '../prisma/prisma.service';
import { PUBLIC_KEY } from './decorators';
import { verifyAccessToken } from './token';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (isPublic) return true;
    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers?.authorization;
    const m = header ? /^Bearer\s+(.+)$/i.exec(header) : null;
    if (!m) throw new DomainError('UNAUTHENTICATED', 'Missing bearer token');
    const claims = verifyAccessToken(m[1]!);
    if (!claims) throw new DomainError('UNAUTHENTICATED', 'Invalid or expired token');
    const session = await this.prisma.session.findUnique({ where: { id: claims.sid } });
    if (!session || session.userId !== claims.sub || session.revokedAt || session.expiresAt <= new Date()) {
      throw new DomainError('UNAUTHENTICATED', 'Session is no longer valid');
    }
    const user = await loadAuthUser(this.prisma, claims.sub);
    if (!user) throw new DomainError('UNAUTHENTICATED', 'User not found or inactive');
    req.user = user;
    req.sessionId = session.id;
    return true;
  }
}
