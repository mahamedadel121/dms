import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createLocalStorage, signFileUrl, verifyFileUrl } from './index';

const mk = () => createLocalStorage(mkdtempSync(join(tmpdir(), 'wp5-st-')));
const parse = (url: string) => {
  const u = new URL(url, 'http://x');
  const keyB64 = u.pathname.split('/').pop()!;
  return {
    keyB64,
    exp: u.searchParams.get('exp')!,
    d: u.searchParams.get('d') ?? undefined,
    n: u.searchParams.get('n') ?? undefined,
    sig: u.searchParams.get('sig')!,
  };
};

describe('LocalFsStorage', () => {
  it('puts, gets, stats, streams, deletes', async () => {
    const s = mk();
    const buf = Buffer.from('hello');
    const r = await s.put('a/b/c.txt', buf);
    expect(r.size).toBe(5);
    expect(r.sha256).toBe(createHash('sha256').update(buf).digest('hex'));
    expect((await s.get('a/b/c.txt')).toString()).toBe('hello');
    expect((await s.stat('a/b/c.txt')).size).toBe(5);
    expect(await s.exists('a/b/c.txt')).toBe(true);
    const chunks: Buffer[] = [];
    for await (const c of s.stream('a/b/c.txt')) chunks.push(c as Buffer);
    expect(Buffer.concat(chunks).toString()).toBe('hello');
    await s.delete('a/b/c.txt');
    expect(await s.exists('a/b/c.txt')).toBe(false);
    await s.delete('a/b/c.txt'); // idempotent
  });
  it('accepts streams and honours ifNotExists, leaving no temp files', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wp5-st-'));
    const s = createLocalStorage(root);
    await s.put('x/y.bin', Readable.from([Buffer.from('ab'), Buffer.from('cd')]), { ifNotExists: true });
    await expect(s.put('x/y.bin', Buffer.from('z'), { ifNotExists: true })).rejects.toMatchObject({ code: 'CONFLICT' });
    expect((await s.get('x/y.bin')).toString()).toBe('abcd');
    expect(readdirSync(join(root, 'x'))).toEqual(['y.bin']);
  });
  it('rejects path traversal and bad keys', async () => {
    const s = mk();
    for (const k of ['../x', 'a/../../x', '/etc/passwd', 'a//b', 'a/./b', 'a\\b', 'C:/x', '..', 'a/..', '', 'a b', 'a/%2e%2e/b']) {
      await expect(s.put(k, Buffer.from('x'))).rejects.toMatchObject({ code: 'VALIDATION' });
      await expect(s.get(k)).rejects.toMatchObject({ code: 'VALIDATION' });
    }
  });
  it('get of a missing key is NOT_FOUND', async () => {
    await expect(mk().get('nope/x.png')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('signed URLs', () => {
  it('round-trips', () => {
    const p = parse(signFileUrl('attachments/2026/01/a.jpg', { ttlSec: 60, download: true, fileName: 'my file.jpg' }));
    expect(verifyFileUrl(p)).toEqual({ key: 'attachments/2026/01/a.jpg', download: true, fileName: 'my file.jpg' });
    const q = parse(signFileUrl('a/b.png'));
    expect(verifyFileUrl(q)).toEqual({ key: 'a/b.png', download: false, fileName: undefined });
  });
  it('rejects expired, tampered, wrong key and bad input', () => {
    const p = parse(signFileUrl('a/b.png', { ttlSec: -5 }));
    expect(verifyFileUrl(p)).toBeNull();
    const ok = parse(signFileUrl('a/b.png'));
    expect(verifyFileUrl({ ...ok, exp: String(Number(ok.exp) + 1000) })).toBeNull();
    expect(verifyFileUrl({ ...ok, d: '1' })).toBeNull();
    expect(verifyFileUrl({ ...ok, n: 'evil' })).toBeNull();
    expect(verifyFileUrl({ ...ok, keyB64: Buffer.from('a/c.png').toString('base64url') })).toBeNull();
    expect(verifyFileUrl({ ...ok, sig: 'AAAA' })).toBeNull();
    expect(verifyFileUrl({ ...ok, sig: '' })).toBeNull();
    expect(verifyFileUrl({ ...ok, keyB64: Buffer.from('../x').toString('base64url') })).toBeNull();
  });
});
