import { join } from 'node:path';
import { findRepoRoot, loadEnv } from './env';

export const PG_PORT = 54329;

export function pgBin(exe: string): string {
  loadEnv();
  const dir = process.env.PG_BIN || (process.platform === 'win32' ? 'C:/Program Files/PostgreSQL/17/bin' : '');
  const name = process.platform === 'win32' ? `${exe}.exe` : exe;
  return dir ? join(dir, name) : name;
}

export function pgUrl(): URL {
  loadEnv();
  return new URL(process.env.DATABASE_URL || `postgresql://postgres@localhost:${PG_PORT}/dms`);
}

/** Connection URL to the maintenance database `postgres` on the same server. */
export function adminUrl(): string {
  const u = pgUrl();
  u.pathname = '/postgres';
  u.search = '';
  return u.toString();
}

export const pgDataDir = () => join(findRepoRoot(), '.pgdata');
