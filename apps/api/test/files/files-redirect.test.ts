import { Readable } from 'node:stream';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { resetConfigCache } from '@dms/core/config';
import { setStorageForTests, signFileUrl, type StorageAdapter } from '@dms/core/storage';
import { createTestApp, type TestApp } from '../helpers';

let t: TestApp;
const saved = { ...process.env };
const presigned: Array<Record<string, unknown>> = [];

const fakeStorage: StorageAdapter = {
  async put(key) {
    return { key, size: 0, sha256: '' };
  },
  async get() {
    return Buffer.from('FAKE');
  },
  stream() {
    return Readable.from([Buffer.from('FAKE')]);
  },
  async exists() {
    return true;
  },
  async stat() {
    return { size: 4 };
  },
  async delete() {},
  async presignGet(key, o) {
    presigned.push({ key, ...o });
    return 'https://s3.example.test/bucket/obj?X-Amz-Signature=abc';
  },
};

beforeAll(async () => {
  t = await createTestApp('p2-files-redirect');
  setStorageForTests(fakeStorage);
});
afterAll(async () => {
  setStorageForTests(null);
  await t?.close();
});
afterEach(() => {
  process.env = { ...saved };
  resetConfigCache();
});

describe('files presigned redirect', () => {
  it('streams the file when the redirect is off', async () => {
    process.env.S3_PRESIGNED_REDIRECT = 'false';
    resetConfigCache();
    const res = await t.http.get(signFileUrl('attachments/2026/01/a.png', { ttlSec: 60 }));
    expect(res.status).toBe(200);
    expect(res.body.toString()).toBe('FAKE');
  });
  it('redirects to the presigned URL when enabled', async () => {
    process.env.S3_PRESIGNED_REDIRECT = 'true';
    resetConfigCache();
    const res = await t.http
      .get(signFileUrl('attachments/2026/01/a.png', { ttlSec: 60, download: true, fileName: 'a.png' }))
      .redirects(0);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('https://s3.example.test/bucket/obj?X-Amz-Signature=abc');
    expect(res.headers['cache-control']).toBe('no-store');
    const last = presigned[presigned.length - 1];
    expect(last).toMatchObject({ key: 'attachments/2026/01/a.png', download: true, fileName: 'a.png', contentType: 'image/png' });
    expect(Number(last.ttlSec)).toBeLessThanOrEqual(300);
  });
  it('still rejects a bad signature', async () => {
    process.env.S3_PRESIGNED_REDIRECT = 'true';
    resetConfigCache();
    const ok = signFileUrl('attachments/2026/01/a.png', { ttlSec: 60 });
    const res = await t.http.get(ok.replace(/sig=.{4}/, 'sig=AAAA')).redirects(0);
    expect(res.status).toBe(403);
  });
});
