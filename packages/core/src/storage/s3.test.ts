import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import { resetConfigCache } from '../config';
import { DomainError } from '../errors';
import { getStorage } from './index';
import { createS3Storage, objectKey, s3ConfigFromEnv, type S3Config, type S3Like } from './s3';

const cfg: S3Config = { bucket: 'b', region: 'us-east-1', forcePathStyle: true, prefix: '/pre/fix/' };

type Cmd = { constructor: { name: string }; input: any };
function fake(handler: (c: Cmd) => any = () => ({})) {
  const calls: Cmd[] = [];
  const client: S3Like = {
    async send(c: unknown) {
      calls.push(c as Cmd);
      return handler(c as Cmd);
    },
  };
  return { client, calls };
}
const named = (name: string, extra: object = {}) => Object.assign(new Error(name), { name }, extra);
const body = (data: string) => ({
  transformToByteArray: async () => new Uint8Array(Buffer.from(data)),
});

describe('S3 storage', () => {
  it('prefixes object keys', () => {
    expect(objectKey(cfg, 'a/b.txt')).toBe('pre/fix/a/b.txt');
    expect(objectKey({ ...cfg, prefix: undefined }, 'a/b.txt')).toBe('a/b.txt');
  });
  it('rejects invalid keys', async () => {
    const { client } = fake();
    const s = createS3Storage(cfg, { client });
    expect(() => objectKey(cfg, '../x')).toThrow(DomainError);
    await expect(s.get('/abs')).rejects.toMatchObject({ code: 'VALIDATION' });
  });
  it('put(Buffer) sends PutObject and returns size and sha256', async () => {
    const { client, calls } = fake();
    const buf = Buffer.from('hello');
    const r = await createS3Storage(cfg, { client }).put('a/b.txt', buf, { contentType: 'text/plain' });
    expect(r).toEqual({ key: 'a/b.txt', size: 5, sha256: createHash('sha256').update(buf).digest('hex') });
    expect(calls[0].constructor.name).toBe('PutObjectCommand');
    expect(calls[0].input).toMatchObject({ Bucket: 'b', Key: 'pre/fix/a/b.txt', ContentType: 'text/plain' });
  });
  it('ifNotExists sends IfNoneMatch *', async () => {
    const { client, calls } = fake();
    await createS3Storage(cfg, { client }).put('a.txt', Buffer.from('x'), { ifNotExists: true });
    expect(calls[0].input.IfNoneMatch).toBe('*');
  });
  it('a 412 becomes CONFLICT', async () => {
    const { client } = fake(() => {
      throw named('PreconditionFailed', { $metadata: { httpStatusCode: 412 } });
    });
    await expect(
      createS3Storage(cfg, { client }).put('a.txt', Buffer.from('x'), { ifNotExists: true }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });
  it('put(Readable) hashes the stream and uploads', async () => {
    const { client } = fake();
    let uploaded = '';
    let uploadKey = '';
    const upload = async (p: { Key: string; Body: Readable }) => {
      uploadKey = p.Key;
      for await (const c of p.Body) uploaded += (c as Buffer).toString();
    };
    const r = await createS3Storage(cfg, { client, upload }).put(
      's/f.bin',
      Readable.from([Buffer.from('ab'), Buffer.from('cd')]),
    );
    expect(uploaded).toBe('abcd');
    expect(uploadKey).toBe('pre/fix/s/f.bin');
    expect(r).toEqual({ key: 's/f.bin', size: 4, sha256: createHash('sha256').update('abcd').digest('hex') });
  });
  it('put(Readable, ifNotExists) refuses an existing object', async () => {
    const { client } = fake(); // HeadObject succeeds -> the object exists
    const upload = async () => {
      throw new Error('should not upload');
    };
    await expect(
      createS3Storage(cfg, { client, upload }).put('s/f.bin', Readable.from(['x']), { ifNotExists: true }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });
  it('get returns a Buffer', async () => {
    const { client } = fake(() => ({ Body: body('data') }));
    expect((await createS3Storage(cfg, { client }).get('a.txt')).toString()).toBe('data');
  });
  it('get maps NoSuchKey to NOT_FOUND', async () => {
    const { client } = fake(() => {
      throw named('NoSuchKey');
    });
    await expect(createS3Storage(cfg, { client }).get('a.txt')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
  it('stream pipes the body', async () => {
    const { client } = fake(() => ({ Body: Readable.from([Buffer.from('str'), Buffer.from('eam')]) }));
    let out = '';
    for await (const c of createS3Storage(cfg, { client }).stream('a.txt')) out += (c as Buffer).toString();
    expect(out).toBe('stream');
  });
  it('stream emits NOT_FOUND on a missing object', async () => {
    const { client } = fake(() => {
      throw named('NoSuchKey');
    });
    const s = createS3Storage(cfg, { client }).stream('a.txt');
    await expect(
      (async () => {
        for await (const _ of s) void _;
      })(),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
  it('exists is true and false', async () => {
    const yes = createS3Storage(cfg, { client: fake().client });
    expect(await yes.exists('a.txt')).toBe(true);
    const no = createS3Storage(cfg, {
      client: fake(() => {
        throw named('NotFound', { $metadata: { httpStatusCode: 404 } });
      }).client,
    });
    expect(await no.exists('a.txt')).toBe(false);
  });
  it('stat returns the size', async () => {
    const { client } = fake(() => ({ ContentLength: 42 }));
    expect(await createS3Storage(cfg, { client }).stat('a.txt')).toEqual({ size: 42 });
  });
  it('delete sends DeleteObject', async () => {
    const { client, calls } = fake();
    await createS3Storage(cfg, { client }).delete('a.txt');
    expect(calls[0].constructor.name).toBe('DeleteObjectCommand');
    expect(calls[0].input).toMatchObject({ Bucket: 'b', Key: 'pre/fix/a.txt' });
  });
  it('presignGet passes the disposition for downloads', async () => {
    let seen: any;
    const presign = async (_k: string, o: any) => {
      seen = o;
      return 'https://signed.example/x';
    };
    const s = createS3Storage(cfg, { client: fake().client, presign });
    expect(
      await s.presignGet('a/b.pdf', { ttlSec: 60, download: true, fileName: 'My "doc".pdf', contentType: 'application/pdf' }),
    ).toBe('https://signed.example/x');
    expect(seen.ttlSec).toBe(60);
    expect(seen.contentType).toBe('application/pdf');
    expect(seen.disposition).toMatch(/^attachment; filename="My _doc_\.pdf"; filename\*=UTF-8''/);
    await s.presignGet('a/b.pdf', { ttlSec: 60 });
    expect(seen.disposition).toBeUndefined();
  });
});

describe('S3 config and driver selection', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
    resetConfigCache();
  });
  it('getStorage returns the S3 driver when STORAGE_DRIVER=s3', () => {
    process.env.STORAGE_DRIVER = 's3';
    process.env.S3_BUCKET = 'test-bucket';
    process.env.S3_ENDPOINT = 'http://127.0.0.1:9';
    process.env.S3_ACCESS_KEY_ID = 'k';
    process.env.S3_SECRET_ACCESS_KEY = 's';
    resetConfigCache();
    const s = getStorage();
    expect(typeof s.presignGet).toBe('function');
    expect(getStorage()).toBe(s);
  });
  it('s3ConfigFromEnv throws without a bucket', () => {
    process.env.STORAGE_DRIVER = 's3';
    delete process.env.S3_BUCKET;
    resetConfigCache();
    expect(() => s3ConfigFromEnv()).toThrow(DomainError);
  });
});

describe.skipIf(!process.env.S3_TEST_ENDPOINT)('live round trip against MinIO', () => {
  it('put, exists, get, stat, presignGet + fetch, delete', async () => {
    const s = createS3Storage({
      bucket: process.env.S3_TEST_BUCKET ?? 'dms-test',
      region: 'us-east-1',
      endpoint: process.env.S3_TEST_ENDPOINT,
      accessKeyId: process.env.S3_TEST_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_TEST_SECRET_ACCESS_KEY,
      forcePathStyle: true,
      prefix: `live-${Date.now()}`,
    });
    await s.put('t/a.txt', Buffer.from('live'), { contentType: 'text/plain' });
    expect(await s.exists('t/a.txt')).toBe(true);
    expect((await s.get('t/a.txt')).toString()).toBe('live');
    expect((await s.stat('t/a.txt')).size).toBe(4);
    const url = await s.presignGet('t/a.txt', { ttlSec: 60 });
    expect(await (await fetch(url)).text()).toBe('live');
    await s.delete('t/a.txt');
    expect(await s.exists('t/a.txt')).toBe(false);
  });
});
