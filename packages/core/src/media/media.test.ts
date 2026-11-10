import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupTestDb, type TestDb } from '@dms/db/testing';
import { createLocalStorage, type StorageAdapter } from '../storage';
import { computeDHash, flagDuplicates, ingestAttachment, sniffMime } from './index';

/** Deterministic "photo": smooth gradients plus a few blocks, so dHash is meaningful. */
async function pattern(seed: number, w = 640, h = 480): Promise<Buffer> {
  const px = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 3;
      const block = (Math.floor(x / 80) * 7 + Math.floor(y / 60) * (seed + 3)) % 5;
      px[o] = (x * (seed + 1) * 0.37 + block * 40) % 256;
      px[o + 1] = (y * 0.53 * (seed % 3 + 1) + block * 25) % 256;
      px[o + 2] = ((x + y) * 0.2 + seed * 31 + block * 55) % 256;
    }
  }
  return sharp(px, { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality: 90 }).toBuffer();
}

let t: TestDb;
let storage: StorageAdapter;
let typeId: string;
let wfvId: string;

async function mkRequest(n: string) {
  return t.prisma.request.create({
    data: {
      number: n,
      requestTypeId: typeId,
      workflowVersionId: wfvId,
      channel: 'WEB',
      totalOriginal: '10.00',
      totalFinal: '10.00',
    },
  });
}

beforeAll(async () => {
  t = await setupTestDb('wp5-media');
  storage = createLocalStorage(mkdtempSync(join(tmpdir(), 'wp5-media-')));
  typeId = (await t.prisma.requestType.findFirstOrThrow()).id;
  wfvId = (await t.prisma.workflowVersion.findFirstOrThrow()).id;
});
afterAll(async () => {
  await t?.teardown();
});

describe('sniffMime', () => {
  it('detects by magic bytes only', async () => {
    expect(sniffMime(await pattern(1))).toBe('image/jpeg');
    expect(sniffMime(await sharp(await pattern(1)).png().toBuffer())).toBe('image/png');
    expect(sniffMime(await sharp(await pattern(1)).webp().toBuffer())).toBe('image/webp');
    expect(sniffMime(Buffer.from('%PDF-1.7\n...'))).toBe('application/pdf');
    expect(sniffMime(Buffer.from('MZ\x90\x00\x03 this is an exe'))).toBeNull();
    expect(sniffMime(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    expect(sniffMime(Buffer.alloc(0))).toBeNull();
  });
});

describe('ingestAttachment', () => {
  it('stores original + thumbnail, sha256 and a stable dHash', async () => {
    const bytes = await pattern(1);
    const a = await ingestAttachment(t.prisma, storage, { bytes, originalName: 'x.jpg' });
    expect(a.mimeType).toBe('image/jpeg');
    expect(a.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(a.storageKey).toMatch(/^attachments\/\d{4}\/\d{2}\/[0-9a-f]+\.jpg$/);
    expect(a.thumbKey).toMatch(/^thumbs\//);
    expect(a.width).toBe(640);
    expect(a.phash).not.toBeNull();
    expect((await storage.get(a.storageKey)).equals(bytes)).toBe(true);
    const thumbMeta = await sharp(await storage.get(a.thumbKey!)).metadata();
    expect(thumbMeta.width).toBe(320);
    expect(thumbMeta.format).toBe('jpeg');
    const b = await ingestAttachment(t.prisma, storage, { bytes });
    expect(b.phash).toBe(a.phash);
    expect(b.sha256).toBe(a.sha256);
    expect(await computeDHash(bytes)).toBe(a.phash);
  });
  it('ignores declared name/type: renamed exe is rejected', async () => {
    await expect(
      ingestAttachment(t.prisma, storage, { bytes: Buffer.from('MZ\x90\x00 evil'), originalName: 'receipt.jpg' }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
  });
  it('rejects oversize files and empty files', async () => {
    const big = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(16 * 1024 * 1024)]);
    await expect(ingestAttachment(t.prisma, storage, { bytes: big })).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(ingestAttachment(t.prisma, storage, { bytes: Buffer.alloc(0) })).rejects.toMatchObject({ code: 'VALIDATION' });
  });
  it('rejects a corrupt image and keeps no orphan row', async () => {
    const before = await t.prisma.attachment.count();
    await expect(
      ingestAttachment(t.prisma, storage, { bytes: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.from('garbage')]) }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    expect(await t.prisma.attachment.count()).toBe(before);
  });
  it('stores PDFs without thumbnail or phash', async () => {
    const a = await ingestAttachment(t.prisma, storage, { bytes: Buffer.from('%PDF-1.4\n%fake\n') });
    expect(a.mimeType).toBe('application/pdf');
    expect(a.thumbKey).toBeNull();
    expect(a.phash).toBeNull();
  });
});

describe('flagDuplicates', () => {
  it('flags exact and near duplicates with a link to the other request; not different images', async () => {
    const original = await pattern(5);
    const reqA = await mkRequest('WP5-MEDIA-A');
    const attA = await ingestAttachment(t.prisma, storage, { bytes: original, requestId: reqA.id });

    // exact
    const reqB = await mkRequest('WP5-MEDIA-B');
    const attB = await ingestAttachment(t.prisma, storage, { bytes: original, requestId: reqB.id });
    expect(await flagDuplicates(t.prisma, reqB.id)).toBe(1);
    const dB = await t.prisma.attachmentDuplicate.findFirstOrThrow({ where: { attachmentId: attB.id } });
    expect(dB).toMatchObject({ kind: 'EXACT', otherRequestId: reqA.id, duplicateOfId: attA.id, distance: 0 });
    expect((await t.prisma.request.findUniqueOrThrow({ where: { id: reqB.id } })).hasDuplicateWarning).toBe(true);
    expect(await t.prisma.requestEvent.count({ where: { requestId: reqB.id, type: 'DUPLICATE_FLAGGED' } })).toBe(1);
    // idempotent
    expect(await flagDuplicates(t.prisma, reqB.id)).toBe(0);

    // near: resized + re-encoded
    const reqC = await mkRequest('WP5-MEDIA-C');
    const reencoded = await sharp(original).resize({ width: 320 }).jpeg({ quality: 55 }).toBuffer();
    const attC = await ingestAttachment(t.prisma, storage, { bytes: reencoded, requestId: reqC.id });
    expect(attC.sha256).not.toBe(attA.sha256);
    expect(await flagDuplicates(t.prisma, reqC.id)).toBeGreaterThanOrEqual(1);
    const dC = await t.prisma.attachmentDuplicate.findFirstOrThrow({
      where: { attachmentId: attC.id, otherRequestId: reqA.id },
    });
    expect(dC.kind).toBe('NEAR');
    expect(dC.distance).toBeLessThanOrEqual(6);

    // different image
    const reqD = await mkRequest('WP5-MEDIA-D');
    await ingestAttachment(t.prisma, storage, { bytes: await pattern(9, 500, 700), requestId: reqD.id });
    expect(await flagDuplicates(t.prisma, reqD.id)).toBe(0);
    expect((await t.prisma.request.findUniqueOrThrow({ where: { id: reqD.id } })).hasDuplicateWarning).toBe(false);
  });
  it('does not flag images of the same request against each other', async () => {
    const r = await mkRequest('WP5-MEDIA-E');
    const bytes = await pattern(12);
    await ingestAttachment(t.prisma, storage, { bytes, requestId: r.id });
    await ingestAttachment(t.prisma, storage, { bytes, requestId: r.id });
    expect(await flagDuplicates(t.prisma, r.id)).toBe(0);
  });
});
