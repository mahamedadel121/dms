import type { Actor } from '@dms/core/errors';
import type { AuthUser } from '@dms/core/rbac';

export function actorFromReq(req: {
  user?: AuthUser;
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
}): Actor {
  const ua = req.headers?.['user-agent'];
  return {
    type: 'USER',
    userId: req.user?.id,
    label: req.user?.username,
    ip: req.ip,
    userAgent: Array.isArray(ua) ? ua[0] : ua,
  };
}
