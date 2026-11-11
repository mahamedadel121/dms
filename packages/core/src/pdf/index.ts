import { createHash } from 'node:crypto';
import type { PrismaClient, RequestDocument } from '@prisma/client';
import type { TemplateConfig } from '@dms/shared';
import type { Db } from '../common';
import { DomainError } from '../errors';
import { getStorage, type StorageAdapter } from '../storage';
import { buildDocumentModel, buildSampleDocumentModel, type ModelOptions } from './model';
import { renderDocumentHtml } from './html';
import { htmlToPdf } from './browser';

export { amountToArabicWords, integerToArabicWords } from './amountWords';
export { buildDocumentModel, buildSampleDocumentModel, DEFAULT_TEMPLATE_CONFIG } from './model';
export type { DocumentModel, SignatureBlock, ModelOptions } from './model';
export { renderDocumentHtml, escapeHtml } from './html';
export { htmlToPdf, closePdfBrowser } from './browser';

export async function renderRequestPdf(
  db: Db,
  requestId: string,
  o?: { templateConfig?: TemplateConfig; storage?: StorageAdapter },
): Promise<Buffer> {
  const model = await buildDocumentModel(db, requestId, o as ModelOptions);
  return htmlToPdf(renderDocumentHtml(model));
}

/** HTML of a template filled with sample data (template editor, no request chosen). */
export function renderSampleHtml(cfg: TemplateConfig, layoutKey?: string): string {
  return renderDocumentHtml(buildSampleDocumentModel(cfg, layoutKey));
}

export function sha256Hex(b: Buffer): string {
  return createHash('sha256').update(b).digest('hex');
}

/**
 * Idempotent final PDF (job pdf.finalize). An existing FINAL document is returned untouched;
 * the stored file is never overwritten.
 */
export async function finalizeRequestPdf(
  prisma: PrismaClient,
  storage: StorageAdapter | undefined,
  requestId: string,
): Promise<RequestDocument> {
  const store = storage ?? getStorage();
  const existing = await prisma.requestDocument.findUnique({ where: { requestId_kind: { requestId, kind: 'FINAL' } } });
  if (existing) return existing;
  const req = await prisma.request.findUnique({
    where: { id: requestId },
    select: { id: true, number: true, status: true, templateVersionId: true },
  });
  if (!req) throw new DomainError('NOT_FOUND', 'Request not found');
  if (req.status !== 'PAID') throw new DomainError('INVALID_STATE', 'Final PDF can only be generated for a PAID request');

  // Keyed by the request id (unique forever), not the request number: numbers repeat after a database
  // rebuild or restore, and a leftover file under a number-based key was adopted as another request's PDF.
  const key = finalPdfKey(req);
  if (await store.exists(key)) {
    // a previous attempt stored the file but crashed before the row insert: adopt the stored bytes
    const stored = await store.get(key);
    return insertDocument(prisma, requestId, req, key, sha256Hex(stored), stored.length);
  }
  const pdf = await renderRequestPdf(prisma, requestId, { storage: store });
  try {
    await store.put(key, pdf, { contentType: 'application/pdf', ifNotExists: true });
  } catch (e) {
    // a concurrent finalize stored the file first: the stored bytes win, ours are discarded
    if (!(await store.exists(key))) throw e;
    const stored = await store.get(key);
    return insertDocument(prisma, requestId, req, key, sha256Hex(stored), stored.length);
  }
  return insertDocument(prisma, requestId, req, key, sha256Hex(pdf), pdf.length);
}

/** Storage key of a request's final PDF: unique per request id; the number is only there for humans. */
export function finalPdfKey(req: { id: string; number: string }): string {
  return `documents/${req.id}/${req.number}-final.pdf`;
}

async function insertDocument(
  prisma: PrismaClient,
  requestId: string,
  req: { templateVersionId: string | null },
  key: string,
  sha256: string,
  sizeBytes: number,
): Promise<RequestDocument> {
  try {
    return await prisma.$transaction(async (tx) => {
      const doc = await tx.requestDocument.create({
        data: { requestId, templateVersionId: req.templateVersionId, kind: 'FINAL', storageKey: key, sha256, sizeBytes, isLocked: true },
      });
      await tx.requestEvent.create({
        data: { requestId, type: 'PDF_FINALIZED', actorType: 'SYSTEM', data: { sha256, storageKey: key } },
      });
      return doc;
    });
  } catch (e) {
    const again = await prisma.requestDocument.findUnique({ where: { requestId_kind: { requestId, kind: 'FINAL' } } });
    if (again) return again; // concurrent finalize won
    throw e;
  }
}

/** Recomputes the hash of the stored final PDF. */
export async function verifyFinalPdf(
  db: Db,
  storage: StorageAdapter,
  requestId: string,
): Promise<{ ok: boolean; sha256: string | null; actualSha256: string | null; locked: boolean }> {
  const doc = await db.requestDocument.findUnique({ where: { requestId_kind: { requestId, kind: 'FINAL' } } });
  if (!doc) return { ok: false, sha256: null, actualSha256: null, locked: false };
  let actual: string | null = null;
  try {
    actual = sha256Hex(await storage.get(doc.storageKey));
  } catch {
    actual = null;
  }
  return { ok: actual === doc.sha256, sha256: doc.sha256, actualSha256: actual, locked: doc.isLocked };
}
export { createRequestFixture } from './fixtures'; // test helper (WP4 tests, other WPs may reuse)
export type { Scenario, FixtureOptions } from './fixtures';
