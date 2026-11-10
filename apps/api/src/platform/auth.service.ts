import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { audit } from '@dms/core/audit';
import { getConfig } from '@dms/core/config';
import type { Actor } from '@dms/core/errors';
import { DomainError } from '@dms/core/errors';
import { loadAuthUser } from '@dms/core/rbac';
import type { AuthResponse, Me, SessionInfo } from '@dms/shared';
import { hashPassword, verifyPassword } from '../common/password';
import { signAccessToken } from '../common/token';
import { PrismaService } from '../prisma/prisma.service';

const MAX_FAILURES = 5;
const LOCK_MINUTES = 15;
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const newRefreshToken = () => randomBytes(32).toString('base64url');

@Injectable()
export class AuthService {
  private readonly attempts = new Map<string, number[]>();
  constructor(private readonly prisma: PrismaService) {}

  /** Sliding window per ip+username (LOGIN_RATE_MAX per LOGIN_RATE_WINDOW_SEC; defaults 20 / 60). */
  private rateLimit(key: string): void {
    const max = Number(process.env.LOGIN_RATE_MAX ?? 20);
    const windowMs = Number(process.env.LOGIN_RATE_WINDOW_SEC ?? 60) * 1000;
    const now = Date.now();
    const arr = (this.attempts.get(key) ?? []).filter((t) => now - t < windowMs);
    if (arr.length >= max) {
      this.attempts.set(key, arr);
      throw new DomainError('FORBIDDEN', 'Too many login attempts, try again later', 429);
    }
    arr.push(now);
    this.attempts.set(key, arr);
    if (this.attempts.size > 5000) this.attempts.clear();
  }

  async buildMe(userId: string): Promise<Me> {
    const au = await loadAuthUser(this.prisma, userId);
    if (!au) throw new DomainError('UNAUTHENTICATED', 'User not found or inactive');
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const sig = await this.prisma.signature.count({ where: { userId, isActive: true } });
    return {
      id: au.id,
      username: au.username,
      fullName: au.fullName,
      locale: user.locale,
      departmentId: au.departmentId,
      isSuperUser: au.isSuperUser,
      roles: au.roles,
      permissions: au.permissions,
      hasSignature: sig > 0,
      mustChangePassword: user.mustChangePassword,
      telegramLinked: user.telegramUserId !== null,
    };
  }

  private async issue(userId: string, sessionId: string, refreshToken: string): Promise<AuthResponse> {
    return {
      accessToken: signAccessToken(userId, sessionId),
      refreshToken,
      expiresIn: getConfig().JWT_ACCESS_TTL_SEC,
      user: await this.buildMe(userId),
    };
  }

  async login(username: string, password: string, actor: Actor): Promise<AuthResponse> {
    this.rateLimit(`${actor.ip ?? '-'}|${username.toLowerCase()}`);
    const user = await this.prisma.user.findUnique({ where: { username } });
    const bad = () => new DomainError('UNAUTHENTICATED', 'Invalid username or password');
    if (!user) throw bad();
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new DomainError('FORBIDDEN', 'Account temporarily locked after repeated failures', undefined, {
        reason: 'ACCOUNT_LOCKED',
        lockedUntil: user.lockedUntil.toISOString(),
      });
    }
    const ok = user.isActive && (await verifyPassword(user.passwordHash, password));
    if (!ok) {
      const failed = user.failedLoginCount + 1;
      const lock = failed >= MAX_FAILURES;
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount: lock ? 0 : failed,
          lockedUntil: lock ? new Date(Date.now() + LOCK_MINUTES * 60000) : user.lockedUntil,
        },
      });
      await audit(this.prisma, {
        actor: { ...actor, type: 'SYSTEM', label: username },
        action: lock ? 'auth.lockout' : 'auth.login_failed',
        entityType: 'User',
        entityId: user.id,
        meta: { failed },
      });
      throw bad();
    }
    const refreshToken = newRefreshToken();
    const session = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
      });
      return tx.session.create({
        data: {
          userId: user.id,
          refreshTokenHash: sha256(refreshToken),
          expiresAt: new Date(Date.now() + getConfig().REFRESH_TTL_DAYS * 86400000),
          ip: actor.ip ?? null,
          userAgent: actor.userAgent ?? null,
        },
      });
    });
    await audit(this.prisma, {
      actor: { ...actor, userId: user.id, label: user.username },
      action: 'auth.login',
      entityType: 'Session',
      entityId: session.id,
    });
    return this.issue(user.id, session.id, refreshToken);
  }

  async refresh(token: string, actor: Actor): Promise<AuthResponse> {
    const hash = sha256(token);
    const err = () => new DomainError('UNAUTHENTICATED', 'Invalid refresh token');
    const session = await this.prisma.session.findUnique({ where: { refreshTokenHash: hash } });
    if (!session) {
      const reused = await this.prisma.session.findFirst({ where: { previousTokenHash: hash } });
      if (reused && !reused.revokedAt) {
        await this.prisma.session.update({ where: { id: reused.id }, data: { revokedAt: new Date() } });
        await audit(this.prisma, {
          actor: { ...actor, userId: reused.userId },
          action: 'auth.refresh_reuse_detected',
          entityType: 'Session',
          entityId: reused.id,
        });
      }
      throw err();
    }
    if (session.revokedAt || session.expiresAt <= new Date()) throw err();
    const user = await this.prisma.user.findUnique({ where: { id: session.userId } });
    if (!user || !user.isActive) throw err();
    const next = newRefreshToken();
    // compare-and-swap so two concurrent refreshes with the same token cannot both win
    const upd = await this.prisma.session.updateMany({
      where: { id: session.id, refreshTokenHash: hash, revokedAt: null },
      data: { refreshTokenHash: sha256(next), previousTokenHash: hash, lastUsedAt: new Date() },
    });
    if (upd.count !== 1) throw err();
    return this.issue(user.id, session.id, next);
  }

  async logout(sessionId: string, actor: Actor): Promise<void> {
    await this.prisma.session.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date() } });
    await audit(this.prisma, { actor, action: 'auth.logout', entityType: 'Session', entityId: sessionId });
  }

  async changePassword(userId: string, current: string, next: string, sessionId: string, actor: Actor): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await verifyPassword(user.passwordHash, current))) {
      throw new DomainError('VALIDATION', 'Current password is incorrect');
    }
    if (current === next) throw new DomainError('VALIDATION', 'New password must differ from the current one');
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash: await hashPassword(next), mustChangePassword: false },
      }),
      this.prisma.session.updateMany({
        where: { userId, revokedAt: null, id: { not: sessionId } },
        data: { revokedAt: new Date() },
      }),
    ]);
    await audit(this.prisma, { actor, action: 'auth.change_password', entityType: 'User', entityId: userId });
  }

  async listSessions(userId: string, currentId: string): Promise<SessionInfo[]> {
    const rows = await this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastUsedAt: 'desc' },
    });
    return rows.map((s) => ({
      id: s.id,
      ip: s.ip,
      userAgent: s.userAgent,
      createdAt: s.createdAt.toISOString(),
      lastUsedAt: s.lastUsedAt.toISOString(),
      expiresAt: s.expiresAt.toISOString(),
      current: s.id === currentId,
    }));
  }

  async revokeSession(userId: string, id: string, actor: Actor): Promise<void> {
    const r = await this.prisma.session.updateMany({ where: { id, userId, revokedAt: null }, data: { revokedAt: new Date() } });
    if (r.count === 0) throw new DomainError('NOT_FOUND', 'Session not found');
    await audit(this.prisma, { actor, action: 'auth.session_revoke', entityType: 'Session', entityId: id });
  }
}
