import type { Readable } from 'node:stream';
import { DomainError } from '../errors';

// TODO(WP5): implement LocalFsStorage + signed URLs.
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
}

const ni = (n: string): never => {
  throw new DomainError('NOT_IMPLEMENTED', `${n} is not implemented yet (WP5)`);
};

export function getStorage(): StorageAdapter {
  return ni('getStorage');
}
export function createLocalStorage(_root: string): StorageAdapter {
  return ni('createLocalStorage');
}
export function signFileUrl(
  _key: string,
  _o?: { ttlSec?: number; download?: boolean; fileName?: string },
): string {
  return ni('signFileUrl');
}
export function verifyFileUrl(_p: {
  keyB64: string;
  exp: string;
  d?: string;
  n?: string;
  sig: string;
}): { key: string; download: boolean; fileName?: string } | null {
  return ni('verifyFileUrl');
}
