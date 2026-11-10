import type { PrismaClient, RequestDocument } from '@prisma/client';
import type { TemplateConfig } from '@dms/shared';
import type { Db } from '../common';
import type { StorageAdapter } from '../storage';
import { DomainError } from '../errors';

// TODO(WP4): implement per PLAN section 9.
export type DocumentModel = Record<string, unknown>;

const ni = (n: string): never => {
  throw new DomainError('NOT_IMPLEMENTED', `${n} is not implemented yet (WP4)`);
};

export async function buildDocumentModel(
  _db: Db,
  _requestId: string,
  _o?: { templateConfig?: TemplateConfig },
): Promise<DocumentModel> {
  return ni('buildDocumentModel');
}
export function renderDocumentHtml(_model: DocumentModel): string {
  return ni('renderDocumentHtml');
}
export async function htmlToPdf(_html: string): Promise<Buffer> {
  return ni('htmlToPdf');
}
export async function renderRequestPdf(
  _db: Db,
  _requestId: string,
  _o?: { templateConfig?: TemplateConfig },
): Promise<Buffer> {
  return ni('renderRequestPdf');
}
export async function finalizeRequestPdf(
  _prisma: PrismaClient,
  _storage: StorageAdapter,
  _requestId: string,
): Promise<RequestDocument> {
  return ni('finalizeRequestPdf');
}
export function amountToArabicWords(_amount: string): string {
  return ni('amountToArabicWords');
}
