import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, stat as fsStat, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable, Transform } from 'node:stream';
import { getConfig } from '../config';
import { DomainError } from '../errors';
import { createS3Storage, s3ConfigFromEnv } from './s3';

export interface StorageAdapter {
  put(
    key: string,
    data: Buffer | Readable,
    o?: { contentType?: string; ifNotExists?: boolean },
  ): Promise<{ key: string; size: number; sha256: string }>;
  get(key: string): Promise<Buffer>;
  stream(key: string): Readable;
  exists(key: string): Promise<boolean>;
  stat(key: string): Promise<{ size: number }>;
  delete(key: string): Promise<void>;
  /** Short-lived direct download URL (S3 driver only). */
  presignGet?(
    key: string,
    o: { ttlSec: number; download?: boolean; fileName?: string; contentType?: string },
  ): Promise<string>;
}

const KEY_RE = /^[A-Za-z0-9/_.-]+$/;

/** Validates a storage key (relative POSIX path, no traversal). Throws VALIDATION. */
export function assertValidKey(key: string): void {
  if (
    typeof key !== 'string' ||
    key.length === 0 ||
    key.length > 400 ||
    !KEY_RE.test(key) ||
    key.startsWith('/') ||
    key.endsWith('/') ||
    key.split('/').some((seg) => seg === '' || /^\.+$/.test(seg))
  ) {
    throw new DomainError('VALIDATION', 'Invalid storage key');
  }
}

export function createLocalStorage(root: string): StorageAdapter {
  const base = resolve(root);
  const pathOf = (key: string): string => {
    assertValidKey(key);
    const p = resolve(base, ...key.split('/'));
    if (!p.startsWith(base + sep)) throw new DomainError('VALIDATION', 'Invalid storage key');
    return p;
  };
  const notFound = (key: string) => new DomainError('NOT_FOUND', `File not found: ${key}`);

  return {
    async put(key, data, o) {
      const path = pathOf(key);
      await mkdir(dirname(path), { recursive: true });
      if (o?.ifNotExists && existsSync(path)) {
        throw new DomainError('CONFLICT', `File already exists: ${key}`);
      }
      const tmp = `${path}.${randomBytes(6).toString('hex')}.tmp`;
      const hash = createHash('sha256');
      let size = 0;
      const counter = new Transform({
        transform(chunk: Buffer, _enc, cb) {
          hash.update(chunk);
          size += chunk.length;
          cb(null, chunk);
        },
      });
      try {
        await pipeline(Buffer.isBuffer(data) ? Readable.from([data]) : data, counter, createWriteStream(tmp));
        if (o?.ifNotExists && existsSync(path)) {
          throw new DomainError('CONFLICT', `File already exists: ${key}`);
        }
        await rename(tmp, path);
      } catch (e) {
        await rm(tmp, { force: true });
        throw e;
      }
      return { key, size, sha256: hash.digest('hex') };
    },
    async get(key) {
      try {
        return await readFile(pathOf(key));
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT') throw notFound(key);
        throw e;
      }
    },
    stream(key) {
      return createReadStream(pathOf(key));
    },
    async exists(key) {
      try {
        return (await fsStat(pathOf(key))).isFile();
      } catch (e) {
        if (e instanceof DomainError) throw e;
        return false;
      }
    },
    async stat(key) {
      try {
        return { size: (await fsStat(pathOf(key))).size };
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT') throw notFound(key);
        throw e;
      }
    },
    async delete(key) {
      try {
        await unlink(pathOf(key));
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      }
    },
  };
}

function repoRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return process.cwd();
}

let singleton: { root: string; storage: StorageAdapter } | undefined;
let s3Singleton: { key: string; storage: StorageAdapter } | undefined;
let override: StorageAdapter | null = null;

/** Test hook: overrides getStorage() until called with null. */
export function setStorageForTests(s: StorageAdapter | null): void {
  override = s;
}

/** Storage per STORAGE_DRIVER/STORAGE_ROOT (relative roots resolve against the repo root). */
export function getStorage(): StorageAdapter {
  if (override) return override;
  const cfg = getConfig();
  if (cfg.STORAGE_DRIVER === 's3') {
    const s3 = s3ConfigFromEnv();
    const key = `${s3.bucket}|${s3.endpoint ?? ''}|${s3.prefix ?? ''}`;
    if (!s3Singleton || s3Singleton.key !== key) s3Singleton = { key, storage: createS3Storage(s3) };
    return s3Singleton.storage;
  }
  const root = isAbsolute(cfg.STORAGE_ROOT) ? cfg.STORAGE_ROOT : resolve(repoRoot(), cfg.STORAGE_ROOT);
  if (!singleton || singleton.root !== root) singleton = { root, storage: createLocalStorage(root) };
  return singleton.storage;
}

// ---------- signed URLs ----------

const b64u = (b: Buffer | string): string => Buffer.from(b).toString('base64url');

function computeSig(secret: string, key: string, exp: string, d: string, n: string): Buffer {
  return createHmac('sha256', secret).update(`${key}\n${exp}\n${d}\n${n}`).digest();
}

export function signFileUrl(
  key: string,
  o?: { ttlSec?: number; download?: boolean; fileName?: string },
): string {
  assertValidKey(key);
  const secret = getConfig().FILE_URL_SECRET;
  const ttl = o?.ttlSec ?? 300;
  const exp = String(Math.floor(Date.now() / 1000) + ttl);
  const d = o?.download ? '1' : '';
  const n = o?.fileName ?? '';
  const sig = b64u(computeSig(secret, key, exp, d, n));
  const qs = new URLSearchParams({ exp });
  if (d) qs.set('d', d);
  if (n) qs.set('n', n);
  qs.set('sig', sig);
  return `/api/v1/files/${b64u(key)}?${qs.toString()}`;
}

export function verifyFileUrl(p: {
  keyB64: string;
  exp: string;
  d?: string;
  n?: string;
  sig: string;
}): { key: string; download: boolean; fileName?: string } | null {
  try {
    if (!p.keyB64 || !p.exp || !p.sig || !/^-?\d+$/.test(p.exp)) return null;
    const key = Buffer.from(p.keyB64, 'base64url').toString('utf8');
    assertValidKey(key);
    const d = p.d ?? '';
    const n = p.n ?? '';
    const expected = computeSig(getConfig().FILE_URL_SECRET, key, p.exp, d, n);
    const given = Buffer.from(p.sig, 'base64url');
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    if (Number(p.exp) * 1000 < Date.now()) return null;
    return { key, download: d === '1', fileName: n || undefined };
  } catch {
    return null;
  }
}
