import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { getConfig } from '@dms/core/config';
import { DomainError } from '@dms/core/errors';
import { getStorage, verifyFileUrl } from '@dms/core/storage';
import { Public } from '../common/decorators';

const TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  zip: 'application/zip',
  csv: 'text/csv; charset=utf-8',
};

const contentTypeOf = (key: string): string => TYPES[key.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream';

/** ASCII fallback + RFC 5987 UTF-8 name, with header-injection characters removed. */
export function contentDisposition(name: string): string {
  const clean = name.replace(/[\r\n"\\/]/g, '_');
  const ascii = clean.replace(/[^\x20-\x7e]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(clean)}`;
}

@Controller('files')
export class FilesController {
  /** The only public file route: the HMAC signature is the authorization (PLAN section 8). */
  @Public()
  @Get(':keyB64')
  async get(
    @Param('keyB64') keyB64: string,
    @Query('exp') exp: string,
    @Query('sig') sig: string,
    @Res() res: Response,
    @Query('d') d?: string,
    @Query('n') n?: string,
  ): Promise<void> {
    const v = verifyFileUrl({ keyB64, exp: String(exp ?? ''), d: d === undefined ? undefined : String(d), n: n === undefined ? undefined : String(n), sig: String(sig ?? '') });
    if (!v) throw new DomainError('FORBIDDEN', 'Invalid or expired link');
    const storage = getStorage();
    const { size } = await storage.stat(v.key); // NOT_FOUND -> 404
    const remaining = Math.max(0, Number(exp) - Math.floor(Date.now() / 1000));
    if (getConfig().S3_PRESIGNED_REDIRECT && storage.presignGet) {
      const url = await storage.presignGet(v.key, {
        ttlSec: Math.max(1, Math.min(remaining, 300)),
        download: v.download,
        fileName: v.fileName,
        contentType: contentTypeOf(v.key),
      });
      res.setHeader('Cache-Control', 'no-store');
      res.redirect(302, url);
      return;
    }
    res.status(200);
    res.setHeader('Content-Type', contentTypeOf(v.key));
    res.setHeader('Content-Length', String(size));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('Cache-Control', `private, max-age=${remaining}`);
    if (v.download) res.setHeader('Content-Disposition', contentDisposition(v.fileName ?? v.key.split('/').pop()!));
    await new Promise<void>((resolve, reject) => {
      const s = storage.stream(v.key);
      s.on('error', reject);
      res.on('close', resolve);
      s.pipe(res);
    });
  }
}
