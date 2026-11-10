import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { templatePreviewBodySchema, templatePreviewFormatSchema, type PdfVerifyResponse, type TemplatePreviewBody } from '@dms/shared';
import { DomainError } from '@dms/core/errors';
import { canViewRequest } from '@dms/core/engine';
import {
  buildDocumentModel,
  buildSampleDocumentModel,
  htmlToPdf,
  renderDocumentHtml,
  renderRequestPdf,
  verifyFinalPdf,
} from '@dms/core/pdf';
import { getStorage } from '@dms/core/storage';
import { templateConfigSchema } from '@dms/shared';
import { CurrentUser, RequirePermission, ZodPipe } from '../common';
import type { AuthUser } from '@dms/core/rbac';
import { PrismaService } from '../prisma/prisma.service';

function sendPdf(res: Response, bytes: Buffer, name: string): void {
  res.status(200);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Length', String(bytes.length));
  res.setHeader('Content-Disposition', `inline; filename="${name.replace(/[^A-Za-z0-9_.-]/g, '_')}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');
  res.end(bytes);
}

@Controller()
export class DocumentsController {
  constructor(private readonly prisma: PrismaService) {}

  private async assertCanView(user: AuthUser, id: string): Promise<void> {
    // 404 rather than 403 so ids of invisible requests are not confirmable (IDOR)
    if (!(await canViewRequest(this.prisma, user, id))) throw new DomainError('NOT_FOUND', 'Request not found');
  }

  /** Locked final PDF when it exists, otherwise a live preview. */
  @RequirePermission('requests.view')
  @Get('requests/:id/pdf')
  async pdf(@Param('id') id: string, @CurrentUser() user: AuthUser, @Res() res: Response): Promise<void> {
    await this.assertCanView(user, id);
    const req = await this.prisma.request.findUnique({ where: { id }, select: { number: true } });
    if (!req) throw new DomainError('NOT_FOUND', 'Request not found');
    const doc = await this.prisma.requestDocument.findUnique({ where: { requestId_kind: { requestId: id, kind: 'FINAL' } } });
    if (doc) {
      res.setHeader('X-Document-State', 'final');
      res.setHeader('X-Document-Sha256', doc.sha256);
      return sendPdf(res, await getStorage().get(doc.storageKey), `${req.number}.pdf`);
    }
    res.setHeader('X-Document-State', 'preview');
    sendPdf(res, await renderRequestPdf(this.prisma, id), `${req.number}-preview.pdf`);
  }

  @RequirePermission('requests.view')
  @Get('requests/:id/pdf/verify')
  async verify(@Param('id') id: string, @CurrentUser() user: AuthUser): Promise<PdfVerifyResponse> {
    await this.assertCanView(user, id);
    return verifyFinalPdf(this.prisma, getStorage(), id);
  }

  /** Template editor: HTML for the live preview, or a PDF. Sample data when no request is given. */
  @RequirePermission('templates.manage')
  @Post('template-versions/:id/preview')
  async preview(
    @Param('id') id: string,
    @Query('format', new ZodPipe(templatePreviewFormatSchema)) format: 'html' | 'pdf',
    @Body(new ZodPipe(templatePreviewBodySchema)) body: TemplatePreviewBody,
    @Res() res: Response,
  ): Promise<void> {
    const tv = await this.prisma.templateVersion.findUnique({ where: { id } });
    if (!tv) throw new DomainError('NOT_FOUND', 'Template version not found');
    const cfg = body.config ?? templateConfigSchema.parse(tv.config);
    const model = body.requestId
      ? { ...(await buildDocumentModel(this.prisma, body.requestId, { templateConfig: cfg })), layoutKey: tv.layoutKey }
      : buildSampleDocumentModel(cfg, tv.layoutKey);
    const html = renderDocumentHtml(model);
    res.setHeader('Cache-Control', 'private, no-store');
    if (format === 'pdf') return sendPdf(res, await htmlToPdf(html), 'preview.pdf');
    res.status(200);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // the preview is rendered by the editor inside a sandboxed iframe; no scripts are ever emitted
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:");
    res.end(html);
  }
}
