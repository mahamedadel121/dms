// @dms/core/telegram: stateless admin-issued Telegram link tokens (PLAN_V2 B7).
import { createHmac, timingSafeEqual } from 'node:crypto';
import { getConfig } from '../config';
import { DomainError } from '../errors';

export type LinkKind = 'u' | 'd';

const MAX_TOKEN = 64;
const SIG_LEN = 20;

function sign(kind: string, id: string, exp: string): string {
  return createHmac('sha256', getConfig().FILE_URL_SECRET).update(`tg-link\n${kind}\n${id}\n${exp}`).digest('hex').slice(0, SIG_LEN);
}

/** `<kind>_<id>_<expBase36>_<sig>`; only [A-Za-z0-9_], at most 64 chars. */
export function createLinkToken(p: { kind: LinkKind; id: string; ttlSec?: number; now?: Date }): { token: string; expiresAt: Date } {
  if (p.kind !== 'u' && p.kind !== 'd') throw new DomainError('VALIDATION', 'Invalid link kind');
  if (!/^[A-Za-z0-9]+$/.test(p.id)) throw new DomainError('VALIDATION', 'Invalid id for a link token');
  const ttl = p.ttlSec ?? getConfig().TELEGRAM_LINK_TTL_SEC;
  const expSec = Math.floor((p.now ?? new Date()).getTime() / 1000) + ttl;
  const exp = expSec.toString(36);
  const token = `${p.kind}_${p.id}_${exp}_${sign(p.kind, p.id, exp)}`;
  if (token.length > MAX_TOKEN) throw new DomainError('VALIDATION', 'Link token is too long');
  return { token, expiresAt: new Date(expSec * 1000) };
}

export function verifyLinkToken(token: string, now: Date = new Date()): { kind: LinkKind; id: string } | null {
  if (typeof token !== 'string' || token.length > MAX_TOKEN || !/^[ud]_[A-Za-z0-9]+_[a-z0-9]+_[0-9a-f]+$/.test(token)) return null;
  const [kind, id, exp, sig] = token.split('_') as [LinkKind, string, string, string];
  if (sig.length !== SIG_LEN) return null;
  const expected = Buffer.from(sign(kind, id, exp));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  const expSec = parseInt(exp, 36);
  if (!Number.isFinite(expSec) || expSec * 1000 <= now.getTime()) return null;
  return { kind, id };
}

export function buildLinkInfo(p: { kind: LinkKind; id: string; now?: Date }): { command: string; deepLink: string | null; expiresAt: string } {
  const { token, expiresAt } = createLinkToken({ kind: p.kind, id: p.id, ...(p.now ? { now: p.now } : {}) });
  const bot = getConfig().BOT_USERNAME;
  return {
    command: `/start ${token}`,
    deepLink: bot ? `https://t.me/${bot.replace(/^@/, '')}?start=${token}` : null,
    expiresAt: expiresAt.toISOString(),
  };
}
