import { once } from 'node:events';
import { PassThrough } from 'node:stream';
import archiver from 'archiver';
import { PDFDocument } from 'pdf-lib';
import type { Prisma, PrismaClient, ReportExport } from '@prisma/client';
import { JOB_TYPES } from '@dms/shared';
import type { Actor } from '../common';
import { audit } from '../audit';
import { getSetting } from '../config';
import { DomainError } from '../errors';
import { enqueueJob } from '../jobs';
import { signFileUrl, type StorageAdapter } from '../storage';
import { buildIndexWorkbook, buildReportWorkbook, type ImageIndexRow } from './excel';
import { iterateRows, reportTotals, type ReportRowG } from './query';
import type { GroupBy, ReportFilters } from './types';

export type ExportKindName = 'EXCEL' | 'ZIP_IMAGES' | 'PDF_BUNDLE';
export interface ExportOptions {
  groupBy?: GroupBy;
  folderPattern?: string;
}

/** Creates the export row, enqueues `report.export` and audit-logs it, in one transaction. */
export async function createExport(
  prisma: PrismaClient,
  a: { userId: string; kind: ExportKindName; filters: ReportFilters; groupBy?: GroupBy; options?: { folderPattern?: string }; actor: Actor },
): Promise<{ exportId: string }> {
  return prisma.$transaction(async (tx) => {
    const row = await tx.reportExport.create({
      data: {
        requestedById: a.userId,
        kind: a.kind,
        filters: a.filters as unknown as Prisma.InputJsonValue,
        options: { groupBy: a.groupBy ?? null, folderPattern: a.options?.folderPattern ?? null } as Prisma.InputJsonValue,
      },
    });
    await enqueueJob(tx, { type: JOB_TYPES.REPORT_EXPORT, payload: { exportId: row.id }, dedupeKey: `report.export:${row.id}` });
    await audit(tx, {
      actor: a.actor,
      action: 'reports.export.create',
      entityType: 'ReportExport',
      entityId: row.id,
      after: { kind: a.kind, filters: a.filters, groupBy: a.groupBy ?? null, options: a.options ?? null },
    });
    return { exportId: row.id };
  });
}

export interface ExportInfo {
  id: string;
  kind: ExportKindName;
  status: ReportExport['status'];
  fileName: string | null;
  sizeBytes: number | null;
  rowCount: number | null;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
  expiresAt: string | null;
  downloadUrl: string | null;
}

export const DOWNLOAD_TTL_SEC = 300;

export function exportInfo(e: ReportExport): ExportInfo {
  const live = e.status === 'DONE' && !!e.storageKey && (!e.expiresAt || e.expiresAt.getTime() > Date.now());
  return {
    id: e.id,
    kind: e.kind,
    status: e.status === 'DONE' && !live ? 'EXPIRED' : e.status,
    fileName: e.fileName,
    sizeBytes: e.sizeBytes,
    rowCount: e.rowCount,
    error: e.error,
    createdAt: e.createdAt.toISOString(),
    finishedAt: e.finishedAt ? e.finishedAt.toISOString() : null,
    expiresAt: e.expiresAt ? e.expiresAt.toISOString() : null,
    downloadUrl: live ? signFileUrl(e.storageKey!, { ttlSec: DOWNLOAD_TTL_SEC, download: true, fileName: e.fileName ?? undefined }) : null,
  };
}

/** Marks DONE exports past `expiresAt` as EXPIRED and deletes their files (job `exports.sweep`). */
export async function expireExports(prisma: PrismaClient, storage: StorageAdapter): Promise<number> {
  const due = await prisma.reportExport.findMany({ where: { status: 'DONE', expiresAt: { lt: new Date() } } });
  for (const e of due) {
    if (e.storageKey) await storage.delete(e.storageKey).catch(() => undefined);
    await prisma.reportExport.update({ where: { id: e.id }, data: { status: 'EXPIRED' } });
  }
  return due.length;
}

// ---------- builders ----------

const safeSeg = (s: string): string => {
  const t = s.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/\s+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').slice(0, 60);
  return !t || /^\.+$/.test(t) ? '_' : t;
};

export function zipFolder(pattern: string, r: ReportRowG): string {
  const tokens: Record<string, string> = {
    expenseType: r.expenseTypeEn,
    requestNumber: r.requestNumber,
    driver: r.driverName ?? 'no-driver',
    vehicle: r.vehicleNumber ?? 'no-vehicle',
    month: r.submittedAt.slice(0, 7),
  };
  return pattern
    .split('/')
    .map((seg) => seg.replace(/\{(\w+)\}/g, (_m, k: string) => safeSeg(tokens[k] ?? k)))
    .filter((seg) => seg.length > 0)
    .map(safeSeg)
    .join('/');
}

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };

interface Built {
  fileName: string;
  rowCount: number;
}

async function collect(prisma: PrismaClient, f: ReportFilters, g?: GroupBy): Promise<ReportRowG[]> {
  const rows: ReportRowG[] = [];
  for await (const r of iterateRows(prisma, f, g)) rows.push(r);
  return rows;
}

async function buildExcel(prisma: PrismaClient, storage: StorageAdapter, e: ReportExport, key: (name: string) => string, o: ExportOptions): Promise<Built & { storageKey: string; size: number }> {
  const f = e.filters as unknown as ReportFilters;
  const [rows, totals] = await Promise.all([collect(prisma, f, o.groupBy), reportTotals(prisma, f)]);
  const buf = await buildReportWorkbook({ rows, groupBy: o.groupBy, totals });
  const fileName = `report-${stampName()}.xlsx`;
  const put = await storage.put(key(fileName), buf, { contentType: XLSX });
  return { fileName, rowCount: rows.length, storageKey: put.key, size: put.size };
}

async function buildZip(prisma: PrismaClient, storage: StorageAdapter, e: ReportExport, key: (name: string) => string, o: ExportOptions): Promise<Built & { storageKey: string; size: number }> {
  const f = e.filters as unknown as ReportFilters;
  const pattern = o.folderPattern || (await getSetting(prisma, 'reports.zipFolderPattern'));
  const [rows, totals] = await Promise.all([collect(prisma, f, o.groupBy), reportTotals(prisma, f)]);
  const fileName = `images-${stampName()}.zip`;
  const storageKeyOut = key(fileName);

  const pass = new PassThrough();
  const putP = storage.put(storageKeyOut, pass, { contentType: 'application/zip' });
  putP.catch(() => undefined);
  const archive = archiver('zip', { zlib: { level: 1 } });
  archive.on('error', (err) => pass.destroy(err));
  archive.pipe(pass);

  const index: ImageIndexRow[] = [];
  const counters = new Map<string, number>();
  try {
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const atts = await prisma.attachment.findMany({
        where: { lineId: { in: chunk.map((r) => r.lineId) }, isCurrent: true },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      const byLine = new Map<string, typeof atts>();
      for (const a of atts) byLine.set(a.lineId!, [...(byLine.get(a.lineId!) ?? []), a]);
      for (const r of chunk) {
        for (const a of byLine.get(r.lineId) ?? []) {
          const folder = zipFolder(pattern, r);
          const n = (counters.get(folder) ?? 0) + 1;
          counters.set(folder, n);
          const path = `${folder}/image_${n}.${EXT[a.mimeType] ?? 'bin'}`;
          const row: ImageIndexRow = {
            requestNumber: r.requestNumber,
            lineNo: r.lineNo,
            expenseType: r.expenseTypeEn,
            path,
            originalName: a.originalName,
            sha256: a.sha256,
            mimeType: a.mimeType,
            sizeBytes: a.sizeBytes,
            status: 'OK',
          };
          if (await storage.exists(a.storageKey)) {
            archive.append(storage.stream(a.storageKey), { name: path });
            await once(archive, 'entry');
          } else {
            row.status = 'MISSING';
          }
          index.push(row);
        }
      }
    }
    archive.append(await buildIndexWorkbook({ rows, groupBy: o.groupBy, totals }, index), { name: 'index.xlsx' });
    await archive.finalize();
    const put = await putP;
    return { fileName, rowCount: rows.length, storageKey: put.key, size: put.size };
  } catch (err) {
    archive.abort();
    pass.destroy();
    await putP.catch(() => undefined);
    await storage.delete(storageKeyOut).catch(() => undefined);
    throw err;
  }
}

async function buildPdfBundle(prisma: PrismaClient, storage: StorageAdapter, e: ReportExport, key: (name: string) => string, o: ExportOptions): Promise<Built & { storageKey: string; size: number }> {
  const f = e.filters as unknown as ReportFilters;
  const rows = await collect(prisma, f, o.groupBy);
  const ids = [...new Set(rows.map((r) => r.requestId))];
  const docs = await prisma.requestDocument.findMany({ where: { requestId: { in: ids }, kind: 'FINAL' } });
  const docByReq = new Map(docs.map((d) => [d.requestId, d]));
  const merged = await PDFDocument.create();
  let included = 0;
  for (const id of ids) {
    let bytes: Buffer | null = null;
    const d = docByReq.get(id);
    try {
      if (d) bytes = await storage.get(d.storageKey);
      else {
        // No locked final yet: use a live preview when the PDF module is available (WP4), otherwise skip.
        const pdf = await import('../pdf');
        bytes = await pdf.renderRequestPdf(prisma, id);
      }
      const src = await PDFDocument.load(bytes);
      for (const p of await merged.copyPages(src, src.getPageIndices())) merged.addPage(p);
      included++;
    } catch {
      // skipped: unreadable / not renderable
    }
  }
  if (included === 0) throw new DomainError('INVALID_STATE', 'No expense sheets (PDF) are available for the selected requests');
  const fileName = `expense-sheets-${stampName()}.pdf`;
  const put = await storage.put(key(fileName), Buffer.from(await merged.save()), { contentType: 'application/pdf' });
  return { fileName, rowCount: included, storageKey: put.key, size: put.size };
}

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const stampName = (): string => new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '').replace(/^(\d{8})/, '$1-');

/**
 * Background export (job `report.export`). Idempotent: a finished export is left untouched.
 * Failures are stored on the row and notified; they do not throw (the user re-requests).
 */
export async function runExport(prisma: PrismaClient, storage: StorageAdapter, exportId: string): Promise<void> {
  const e = await prisma.reportExport.findUnique({ where: { id: exportId } });
  if (!e) throw new DomainError('NOT_FOUND', `Export ${exportId} not found`);
  if (e.status === 'DONE' || e.status === 'EXPIRED' || e.status === 'FAILED') return;
  await prisma.reportExport.update({ where: { id: e.id }, data: { status: 'RUNNING' } });
  const actor: Actor = { type: 'USER', userId: e.requestedById, label: 'export' };
  const o = ((e.options ?? {}) as { groupBy?: GroupBy | null; folderPattern?: string | null });
  const opts: ExportOptions = { groupBy: o.groupBy ?? undefined, folderPattern: o.folderPattern ?? undefined };
  const key = (name: string) => `exports/${e.id}/${name}`;
  try {
    const built =
      e.kind === 'EXCEL'
        ? await buildExcel(prisma, storage, e, key, opts)
        : e.kind === 'ZIP_IMAGES'
          ? await buildZip(prisma, storage, e, key, opts)
          : await buildPdfBundle(prisma, storage, e, key, opts);
    const ttlH = await getSetting(prisma, 'reports.exportTtlHours');
    const done = await prisma.reportExport.update({
      where: { id: e.id },
      data: {
        status: 'DONE',
        storageKey: built.storageKey,
        fileName: built.fileName,
        sizeBytes: built.size,
        rowCount: built.rowCount,
        error: null,
        finishedAt: new Date(),
        expiresAt: new Date(Date.now() + ttlH * 3600_000),
      },
    });
    const url = signFileUrl(built.storageKey, { ttlSec: DOWNLOAD_TTL_SEC, download: true, fileName: built.fileName });
    await prisma.notification.create({
      data: {
        channel: 'IN_APP',
        recipientUserId: e.requestedById,
        type: 'EXPORT_READY',
        titleAr: 'ملف التصدير جاهز',
        titleEn: 'Your export is ready',
        bodyAr: `تم تجهيز الملف ${built.fileName}`,
        bodyEn: `${built.fileName} is ready to download`,
        data: { exportId: e.id, status: 'DONE', fileName: built.fileName, downloadUrl: url, link: `/api/v1/reports/exports/${e.id}` },
        status: 'SENT',
        sentAt: new Date(),
      },
    });
    await audit(prisma, { actor, action: 'reports.export.completed', entityType: 'ReportExport', entityId: e.id, after: { fileName: done.fileName, rows: built.rowCount, size: built.size } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await prisma.reportExport.update({ where: { id: e.id }, data: { status: 'FAILED', error: msg.slice(0, 500), finishedAt: new Date() } });
    await prisma.notification.create({
      data: {
        channel: 'IN_APP',
        recipientUserId: e.requestedById,
        type: 'EXPORT_READY',
        titleAr: 'فشل ملف التصدير',
        titleEn: 'Export failed',
        bodyAr: `تعذر تجهيز ملف التصدير: ${msg.slice(0, 200)}`,
        bodyEn: `The export could not be prepared: ${msg.slice(0, 200)}`,
        data: { exportId: e.id, status: 'FAILED' },
        status: 'SENT',
        sentAt: new Date(),
      },
    });
    await audit(prisma, { actor, action: 'reports.export.failed', entityType: 'ReportExport', entityId: e.id, meta: { error: msg.slice(0, 500) } });
  }
}
