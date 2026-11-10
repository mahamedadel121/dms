import type { Me } from './types';

type PermissionSubject = Pick<Me, 'isSuperUser' | 'permissions'> | null | undefined;

/**
 * True when the user holds the permission. The Super User holds everything.
 * Pass an array to check "any of". An empty/undefined requirement is always allowed.
 */
export function can(me: PermissionSubject, code: string | readonly string[] | undefined): boolean {
  if (!code || (Array.isArray(code) && code.length === 0)) return true;
  if (!me) return false;
  if (me.isSuperUser) return true;
  const codes = typeof code === 'string' ? [code] : (code as readonly string[]);
  return codes.some((c) => me.permissions.includes(c));
}
