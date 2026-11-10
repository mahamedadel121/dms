import { createHash } from 'node:crypto';
import { PassThrough, Readable, Transform } from 'node:stream';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getConfig } from '../config';
import { DomainError } from '../errors';
import { assertValidKey, type StorageAdapter } from './index';

export interface S3Config {
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  forcePathStyle: boolean;
  prefix?: string;
}

/** The subset of S3Client we use; tests pass a fake. */
export interface S3Like {
  send(command: unknown): Promise<any>;
}

export function s3ConfigFromEnv(): S3Config {
  const c = getConfig();
  if (!c.S3_BUCKET) throw new DomainError('VALIDATION', 'S3_BUCKET must be set when STORAGE_DRIVER=s3');
  return {
    bucket: c.S3_BUCKET,
    region: c.S3_REGION,
    endpoint: c.S3_ENDPOINT || undefined,
    accessKeyId: c.S3_ACCESS_KEY_ID || undefined,
    secretAccessKey: c.S3_SECRET_ACCESS_KEY || undefined,
    forcePathStyle: c.S3_FORCE_PATH_STYLE,
    prefix: c.S3_PREFIX || undefined,
  };
}

/** Full object key: normalised prefix + '/' + key. Validates the key first. */
export function objectKey(cfg: S3Config, key: string): string {
  assertValidKey(key);
  const prefix = (cfg.prefix ?? '').replace(/^\/+|\/+$/g, '');
  return prefix ? `${prefix}/${key}` : key;
}

type PresignOpts = { ttlSec: number; disposition?: string; contentType?: string };

/** Same rules as contentDisposition() in the files controller. */
function attachmentDisposition(name: string): string {
  const clean = name.replace(/[\r\n"\\/]/g, '_');
  const ascii = clean.replace(/[^\x20-\x7e]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(clean)}`;
}

const httpStatus = (e: any): number | undefined => e?.$metadata?.httpStatusCode;
const isNotFound = (e: any): boolean =>
  e?.name === 'NoSuchKey' || e?.name === 'NotFound' || e?.Code === 'NoSuchKey' || httpStatus(e) === 404;
const isPreconditionFailed = (e: any): boolean => e?.name === 'PreconditionFailed' || httpStatus(e) === 412;

export function createS3Storage(
  cfg: S3Config,
  deps?: {
    client?: S3Like;
    presign?: (key: string, o: PresignOpts) => Promise<string>;
    upload?: (p: { Key: string; Body: Readable; ContentType?: string }) => Promise<void>;
  },
): StorageAdapter & { presignGet: NonNullable<StorageAdapter['presignGet']> } {
  const client: S3Like =
    deps?.client ??
    new S3Client({
      region: cfg.region,
      endpoint: cfg.endpoint,
      forcePathStyle: cfg.forcePathStyle,
      credentials:
        cfg.accessKeyId && cfg.secretAccessKey
          ? { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey }
          : undefined,
    });
  const Bucket = cfg.bucket;
  const notFound = (key: string) => new DomainError('NOT_FOUND', `File not found: ${key}`);
  const exists = async (key: string): Promise<boolean> => {
    try {
      await client.send(new HeadObjectCommand({ Bucket, Key: objectKey(cfg, key) }));
      return true;
    } catch (e) {
      if (isNotFound(e)) return false;
      throw e;
    }
  };

  return {
    async put(key, data, o) {
      const Key = objectKey(cfg, key);
      if (Buffer.isBuffer(data)) {
        try {
          await client.send(
            new PutObjectCommand({
              Bucket,
              Key,
              Body: data,
              ContentType: o?.contentType,
              IfNoneMatch: o?.ifNotExists ? '*' : undefined,
            }),
          );
        } catch (e) {
          if (isPreconditionFailed(e)) throw new DomainError('CONFLICT', `File already exists: ${key}`);
          throw e;
        }
        return { key, size: data.length, sha256: createHash('sha256').update(data).digest('hex') };
      }
      if (o?.ifNotExists && (await exists(key))) {
        throw new DomainError('CONFLICT', `File already exists: ${key}`);
      }
      const hash = createHash('sha256');
      let size = 0;
      const counter = new Transform({
        transform(chunk: Buffer, _enc, cb) {
          hash.update(chunk);
          size += chunk.length;
          cb(null, chunk);
        },
      });
      data.on('error', (err) => counter.destroy(err));
      data.pipe(counter);
      const upload =
        deps?.upload ??
        (async (p: { Key: string; Body: Readable; ContentType?: string }) => {
          await new Upload({
            client: client as S3Client,
            params: { Bucket, Key: p.Key, Body: p.Body, ContentType: p.ContentType },
          }).done();
        });
      await upload({ Key, Body: counter, ContentType: o?.contentType });
      return { key, size, sha256: hash.digest('hex') };
    },
    async get(key) {
      try {
        const res = await client.send(new GetObjectCommand({ Bucket, Key: objectKey(cfg, key) }));
        return Buffer.from(await res.Body.transformToByteArray());
      } catch (e) {
        if (isNotFound(e)) throw notFound(key);
        throw e;
      }
    },
    stream(key) {
      const out = new PassThrough();
      let Key: string;
      try {
        Key = objectKey(cfg, key);
      } catch (e) {
        queueMicrotask(() => out.destroy(e as Error));
        return out;
      }
      client
        .send(new GetObjectCommand({ Bucket, Key }))
        .then((res) => {
          const body = res.Body as Readable;
          body.on('error', (err) => out.destroy(err));
          body.pipe(out);
        })
        .catch((e) => out.destroy(isNotFound(e) ? notFound(key) : e));
      return out;
    },
    exists,
    async stat(key) {
      try {
        const res = await client.send(new HeadObjectCommand({ Bucket, Key: objectKey(cfg, key) }));
        return { size: Number(res.ContentLength ?? 0) };
      } catch (e) {
        if (isNotFound(e)) throw notFound(key);
        throw e;
      }
    },
    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket, Key: objectKey(cfg, key) }));
    },
    async presignGet(key, o) {
      const disposition = o.download ? attachmentDisposition(o.fileName ?? key.split('/').pop()!) : undefined;
      if (deps?.presign) {
        objectKey(cfg, key);
        return deps.presign(key, { ttlSec: o.ttlSec, disposition, contentType: o.contentType });
      }
      return getSignedUrl(
        client as S3Client,
        new GetObjectCommand({
          Bucket,
          Key: objectKey(cfg, key),
          ResponseContentDisposition: disposition,
          ResponseContentType: o.contentType,
        }),
        { expiresIn: o.ttlSec },
      );
    },
  };
}
