import { randomBytes } from 'node:crypto';
import { createHash } from 'node:crypto';
import type { Attachment } from '@prisma/client';
import sharp from 'sharp';
import type { Db } from '../common';
import { getSetting } from '../config';
import type { StorageAdapter } from '../storage';
import { DomainError } from '../errors';

export interface IngestAttachmentInput {
  bytes: Buffer;
  originalName?: string;
  botSessionId?: string;
  requestId?: string;
  lineId?: string;
  correctionRequestId?: string;
  uploadedBySubmitterId?: string;
  uploadedByUserId?: string;
  telegramFileUniqueId?: string;
}

type Mime = 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf';

/** Type by magic bytes only; the declared type / extension is never trusted. */
export function sniffMime(bytes: Buffer): Mime | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (bytes.length >= 12 && bytes.toString('latin1', 0, 4) === 'RIFF' && bytes.toString('latin1', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  // %PDF may be preceded by a few bytes of junk per spec; accept within the first 1024 bytes
  if (bytes.length >= 5 && bytes.subarray(0, 1024).includes(Buffer.from('%PDF-'))) return 'application/pdf';
  return null;
}

const EXT: Record<Mime, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };

/** 64-bit dHash (9x8 greyscale, left > right) as a signed bigint. EXIF orientation applied first. */
export async function computeDHash(bytes: Buffer): Promise<bigint> {
  const raw = await sharp(bytes).rotate().greyscale().resize(9, 8, { fit: 'fill', kernel: 'lanczos3' }).raw().toBuffer();
  let v = 0n;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      v = (v << 1n) | (raw[y * 9 + x]! > raw[y * 9 + x + 1]! ? 1n : 0n);
    }
  }
  return BigInt.asIntN(64, v);
}

export async function ingestAttachment(
  db: Db,
  storage: StorageAdapter,
  i: IngestAttachmentInput,
): Promise<Attachment> {
  const maxMb = await getSetting(db, 'media.maxFileSizeMb');
  if (!i.bytes || i.bytes.length === 0) throw new DomainError('VALIDATION', 'Empty file');
  if (i.bytes.length > maxMb * 1024 * 1024) {
    throw new DomainError('VALIDATION', `File exceeds the ${maxMb} MB limit`, 400, { code: 'FILE_TOO_LARGE', maxMb });
  }
  const mime = sniffMime(i.bytes);
  if (!mime) {
    throw new DomainError('VALIDATION', 'Unsupported file type (JPEG, PNG, WebP or PDF only)', 400, { code: 'UNSUPPORTED_TYPE' });
  }

  let phash: bigint | null = null;
  let width: number | null = null;
  let height: number | null = null;
  let thumb: Buffer | null = null;
  if (mime !== 'application/pdf') {
    try {
      const rotated = sharp(i.bytes).rotate();
      const { data, info } = await rotated.toBuffer({ resolveWithObject: true });
      width = info.width;
      height = info.height;
      thumb = await sharp(data).resize({ width: 320, withoutEnlargement: true }).jpeg({ quality: 70 }).toBuffer();
      phash = await computeDHash(i.bytes);
    } catch {
      throw new DomainError('VALIDATION', 'Corrupt or unreadable image', 400, { code: 'CORRUPT_IMAGE' });
    }
  }

  const now = new Date();
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const id = randomBytes(12).toString('hex');
  const storageKey = `attachments/${yyyy}/${mm}/${id}.${EXT[mime]}`;
  const thumbKey = thumb ? `thumbs/${yyyy}/${mm}/${id}.jpg` : null;

  const sha256 = createHash('sha256').update(i.bytes).digest('hex');
  await storage.put(storageKey, i.bytes, { contentType: mime, ifNotExists: true });
  if (thumb && thumbKey) await storage.put(thumbKey, thumb, { contentType: 'image/jpeg' });

  try {
    return await db.attachment.create({
      data: {
        requestId: i.requestId ?? null,
        lineId: i.lineId ?? null,
        botSessionId: i.botSessionId ?? null,
        storageKey,
        thumbKey,
        mimeType: mime,
        sizeBytes: i.bytes.length,
        sha256,
        phash,
        width,
        height,
        originalName: i.originalName ? i.originalName.slice(0, 200) : null,
        telegramFileUniqueId: i.telegramFileUniqueId ?? null,
        uploadedBySubmitterId: i.uploadedBySubmitterId ?? null,
        uploadedByUserId: i.uploadedByUserId ?? null,
        correctionRequestId: i.correctionRequestId ?? null,
      },
    });
  } catch (e) {
    await storage.delete(storageKey).catch(() => undefined);
    if (thumbKey) await storage.delete(thumbKey).catch(() => undefined);
    throw e;
  }
}

/**
 * Flags (never blocks) current attachments of the request that exactly or nearly duplicate an
 * attachment of ANOTHER request. Returns the number of newly created flags.
 */
export async function flagDuplicates(db: Db, requestId: string): Promise<number> {
  const maxDist = await getSetting(db, 'media.nearDuplicateDistance');
  const mine = await db.attachment.findMany({
    where: { requestId, isCurrent: true },
    select: { id: true, sha256: true, phash: true },
  });
  let created = 0;
  for (const a of mine) {
    const phash = a.phash ?? null;
    const matches = await db.$queryRaw<{ id: string; requestId: string; dist: number; exact: boolean }[]>`
      SELECT x.id, x."requestId", CASE WHEN x.sha256 = ${a.sha256} THEN 0
             ELSE bit_count((x.phash # ${phash}::bigint)::bit(64)) END AS dist,
             (x.sha256 = ${a.sha256}) AS exact
      FROM attachments x
      WHERE x."requestId" IS NOT NULL AND x."requestId" <> ${requestId}
        AND (x.sha256 = ${a.sha256}
             OR (${phash}::bigint IS NOT NULL AND x.phash IS NOT NULL
                 AND bit_count((x.phash # ${phash}::bigint)::bit(64)) <= ${maxDist}))
      ORDER BY dist, x."createdAt" LIMIT 5`;
    for (const m of matches) {
      const dist = Number(m.dist);
      const existing = await db.attachmentDuplicate.findUnique({
        where: { attachmentId_duplicateOfId: { attachmentId: a.id, duplicateOfId: m.id } },
      });
      if (existing) continue;
      await db.attachmentDuplicate.create({
        data: {
          attachmentId: a.id,
          duplicateOfId: m.id,
          requestId,
          otherRequestId: m.requestId,
          kind: m.exact ? 'EXACT' : 'NEAR',
          distance: dist,
        },
      });
      created++;
    }
  }
  if (created > 0) {
    await db.request.update({ where: { id: requestId }, data: { hasDuplicateWarning: true } });
    await db.requestEvent.create({
      data: { requestId, type: 'DUPLICATE_FLAGGED', actorType: 'SYSTEM', data: { count: created } },
    });
  }
  return created;
}
