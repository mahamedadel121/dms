import jwt from 'jsonwebtoken';
import { getConfig } from '@dms/core/config';

export interface AccessClaims {
  sub: string;
  sid: string;
}

export function signAccessToken(userId: string, sessionId: string, ttlSec?: number): string {
  const cfg = getConfig();
  return jwt.sign({ sub: userId, sid: sessionId }, cfg.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: ttlSec ?? cfg.JWT_ACCESS_TTL_SEC,
  });
}

/** Returns claims or null when invalid/expired. */
export function verifyAccessToken(token: string): AccessClaims | null {
  try {
    const p = jwt.verify(token, getConfig().JWT_SECRET, { algorithms: ['HS256'] }) as jwt.JwtPayload;
    if (typeof p.sub !== 'string' || typeof p.sid !== 'string') return null;
    return { sub: p.sub, sid: p.sid };
  } catch {
    return null;
  }
}
