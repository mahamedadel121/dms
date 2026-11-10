import { randomBytes } from 'node:crypto';
import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { audit } from '@dms/core/audit';
import { DomainError } from '@dms/core/errors';
import { hasPermission, type AuthUser } from '@dms/core/rbac';
import { getStorage, signFileUrl } from '@dms/core/storage';
import type { SignatureInfo, SignatureRow, SignatureUploadResult } from '@dms/shared';
import { actorFromReq } from '../common/actor';
import { AuthOnly, CurrentUser } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';

type Req_ = Parameters<typeof actorFromReq>[0];
const MAX_BYTES = 2 * 1024 * 1024;

interface Img {
  mime: 'image/png' | 'image/jpeg';
  ext: 'png' | 'jpg';
  width: number | null;
  height: number | null;
}

/** Type is decided by magic bytes only; dimensions are read from the header. */
function sniffImage(b: Buffer): Img | null {
  if (b.length > 24 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { mime: 'image/png', ext: 'png', width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  }
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    let w: number | null = null;
    let h: number | null = null;
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = b[i + 1]!;
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        i += 2;
        continue;
      }
      const len = b.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        h = b.readUInt16BE(i + 5);
        w = b.readUInt16BE(i + 7);
        break;
      }
      i += 2 + len;
    }
    return { mime: 'image/jpeg', ext: 'jpg', width: w, height: h };
  }
  return null;
}

@Controller()
export class SignaturesController {
  constructor(private readonly prisma: PrismaService) {}

  private toRow(s: { id: string; storageKey: string; isActive: boolean; width: number | null; height: number | null; createdAt: Date; deactivatedAt: Date | null }): SignatureRow {
    return {
      id: s.id,
      url: signFileUrl(s.storageKey),
      isActive: s.isActive,
      width: s.width,
      height: s.height,
      createdAt: s.createdAt.toISOString(),
      deactivatedAt: s.deactivatedAt?.toISOString() ?? null,
    };
  }

  /** Owners may manage their own signature; anyone else needs signatures.manage. */
  private async authorize(kind: 'user' | 'submitter', id: string, u: AuthUser): Promise<void> {
    if (kind === 'user' && id === u.id) return;
    if (!hasPermission(u, 'signatures.manage')) throw new DomainError('FORBIDDEN', 'Missing permission');
    const exists =
      kind === 'user' ? await this.prisma.user.findUnique({ where: { id } }) : await this.prisma.submitter.findUnique({ where: { id } });
    if (!exists) throw new DomainError('NOT_FOUND', kind === 'user' ? 'User not found' : 'Driver not found');
  }

  private async upload(kind: 'user' | 'submitter', ownerId: string, file: { buffer: Buffer } | undefined, u: AuthUser, req: Req_): Promise<SignatureUploadResult> {
    await this.authorize(kind, ownerId, u);
    if (!file) throw new DomainError('VALIDATION', 'Upload the image in the "file" field');
    if (file.buffer.length > MAX_BYTES) throw new DomainError('VALIDATION', 'Signature image exceeds 2 MB');
    const img = sniffImage(file.buffer);
    if (!img) throw new DomainError('VALIDATION', 'Signature must be a PNG or JPEG image');
    const key = `signatures/${ownerId}/${randomBytes(12).toString('hex')}.${img.ext}`;
    const put = await getStorage().put(key, file.buffer, { contentType: img.mime, ifNotExists: true });
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const where = kind === 'user' ? { userId: ownerId } : { submitterId: ownerId };
        const prev = await tx.signature.findFirst({ where: { ...where, isActive: true } });
        if (prev) await tx.signature.update({ where: { id: prev.id }, data: { isActive: false, deactivatedAt: new Date() } });
        const created = await tx.signature.create({
          data: { ...where, storageKey: key, sha256: put.sha256, mimeType: img.mime, width: img.width, height: img.height, uploadedById: u.id },
        });
        await audit(tx, {
          actor: actorFromReq(req),
          action: 'signature.upload',
          entityType: kind === 'user' ? 'User' : 'Submitter',
          entityId: ownerId,
          before: prev ? { signatureId: prev.id, sha256: prev.sha256 } : null,
          after: { signatureId: created.id, sha256: created.sha256 },
        });
        return created;
      });
      return { signatureId: row.id, url: signFileUrl(key) };
    } catch (e) {
      await getStorage().delete(key).catch(() => undefined);
      throw e;
    }
  }

  private async info(kind: 'user' | 'submitter', ownerId: string, u: AuthUser): Promise<SignatureInfo> {
    await this.authorize(kind, ownerId, u);
    const rows = await this.prisma.signature.findMany({
      where: kind === 'user' ? { userId: ownerId } : { submitterId: ownerId },
      orderBy: { createdAt: 'desc' },
    });
    const all = rows.map((r) => this.toRow(r));
    return { current: all.find((r) => r.isActive) ?? null, history: all.filter((r) => !r.isActive) };
  }

  private async remove(kind: 'user' | 'submitter', ownerId: string, u: AuthUser, req: Req_): Promise<{ ok: true }> {
    await this.authorize(kind, ownerId, u);
    const where = kind === 'user' ? { userId: ownerId } : { submitterId: ownerId };
    const cur = await this.prisma.signature.findFirst({ where: { ...where, isActive: true } });
    if (!cur) throw new DomainError('NOT_FOUND', 'No active signature');
    await this.prisma.$transaction(async (tx) => {
      await tx.signature.update({ where: { id: cur.id }, data: { isActive: false, deactivatedAt: new Date() } });
      await audit(tx, {
        actor: actorFromReq(req),
        action: 'signature.delete',
        entityType: kind === 'user' ? 'User' : 'Submitter',
        entityId: ownerId,
        before: { signatureId: cur.id },
        after: { signatureId: null },
      });
    });
    return { ok: true };
  }

  private static interceptor = () => FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_BYTES + 1024 } });

  @AuthOnly()
  @Post('users/:id/signature')
  @HttpCode(200)
  @UseInterceptors(SignaturesController.interceptor())
  uploadUser(@Param('id') id: string, @UploadedFile() f: { buffer: Buffer } | undefined, @CurrentUser() u: AuthUser, @Req() req: Req_) {
    return this.upload('user', id, f, u, req);
  }

  @AuthOnly()
  @Post('submitters/:id/signature')
  @HttpCode(200)
  @UseInterceptors(SignaturesController.interceptor())
  uploadSubmitter(@Param('id') id: string, @UploadedFile() f: { buffer: Buffer } | undefined, @CurrentUser() u: AuthUser, @Req() req: Req_) {
    return this.upload('submitter', id, f, u, req);
  }

  @AuthOnly()
  @Get('users/:id/signature')
  getUser(@Param('id') id: string, @CurrentUser() u: AuthUser) {
    return this.info('user', id, u);
  }

  @AuthOnly()
  @Get('submitters/:id/signature')
  getSubmitter(@Param('id') id: string, @CurrentUser() u: AuthUser) {
    return this.info('submitter', id, u);
  }

  @AuthOnly()
  @Delete('users/:id/signature')
  deleteUser(@Param('id') id: string, @CurrentUser() u: AuthUser, @Req() req: Req_) {
    return this.remove('user', id, u, req);
  }

  @AuthOnly()
  @Delete('submitters/:id/signature')
  deleteSubmitter(@Param('id') id: string, @CurrentUser() u: AuthUser, @Req() req: Req_) {
    return this.remove('submitter', id, u, req);
  }
}
