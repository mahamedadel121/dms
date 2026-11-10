import ExcelJS from 'exceljs';
import type { StorageAdapter } from '../storage';
import type { JournalEntryDoc, SapPostResult, SapPostingAdapter } from './types';

const HEADERS = [
  'Reference', 'CompanyCode', 'DocumentType', 'Currency', 'PostingDate', 'DocumentDate', 'HeaderText',
  'Item', 'Side', 'PostingKey', 'GLAccount', 'CostCenter', 'Amount', 'Assignment', 'ItemText',
] as const;

function csvCell(v: unknown): string {
  const s = String(v ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function journalRows(doc: JournalEntryDoc): (string | number)[][] {
  return doc.items.map((it, i) => [
    doc.reference, doc.companyCode, doc.documentType, doc.currency, doc.postingDate, doc.documentDate, doc.headerText,
    i + 1, it.side, it.postingKey, it.glAccount, it.costCenter ?? '', it.amount, it.assignment, it.itemText,
  ]);
}

export function journalToCsv(doc: JournalEntryDoc): string {
  const lines = [HEADERS.join(','), ...journalRows(doc).map((r) => r.map(csvCell).join(','))];
  return '﻿' + lines.join('\r\n') + '\r\n';
}

export async function journalToXlsx(doc: JournalEntryDoc): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Journal Entry');
  ws.addRow([...HEADERS]).font = { bold: true };
  for (const r of journalRows(doc)) ws.addRow(r);
  ws.columns.forEach((c) => (c.width = 16));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/**
 * File export adapter: writes CSV + XLSX under sap-export/<date>/<reference>.* for a manual upload to SAP.
 * Document number FILE-<seq>; an index file per reference makes it idempotent (findByReference).
 */
export class FileSapAdapter implements SapPostingAdapter {
  name = 'file';
  private chain: Promise<unknown> = Promise.resolve();
  constructor(private readonly storage: StorageAdapter) {}

  private indexKey(ref: string) {
    return `sap-export/index/${ref.replace(/[^A-Za-z0-9_.-]/g, '_')}.json`;
  }

  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const p = this.chain.then(fn, fn);
    this.chain = p.catch(() => undefined);
    return p;
  }

  async findByReference(reference: string) {
    const k = this.indexKey(reference);
    if (!(await this.storage.exists(k))) return null;
    const j = JSON.parse((await this.storage.get(k)).toString('utf8'));
    return { documentNumber: j.documentNumber as string, fiscalYear: j.fiscalYear as string };
  }

  post(doc: JournalEntryDoc): Promise<SapPostResult> {
    return this.serial(async () => {
      const existing = await this.findByReference(doc.reference);
      if (existing) return { ...existing, companyCode: doc.companyCode };
      let seq = 1;
      if (await this.storage.exists('sap-export/counter.json')) {
        seq = (JSON.parse((await this.storage.get('sap-export/counter.json')).toString('utf8')).last as number) + 1;
      }
      const base = `sap-export/${doc.postingDate}/${doc.reference}`;
      const csvKey = `${base}.csv`;
      await this.storage.put(csvKey, Buffer.from(journalToCsv(doc), 'utf8'), { contentType: 'text/csv' });
      await this.storage.put(`${base}.xlsx`, await journalToXlsx(doc), {
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const documentNumber = `FILE-${String(seq).padStart(6, '0')}`;
      const fiscalYear = doc.postingDate.slice(0, 4);
      await this.storage.put('sap-export/counter.json', Buffer.from(JSON.stringify({ last: seq })), {
        contentType: 'application/json',
      });
      await this.storage.put(
        this.indexKey(doc.reference),
        Buffer.from(JSON.stringify({ documentNumber, fiscalYear, exportFileKey: csvKey })),
        { contentType: 'application/json' },
      );
      return {
        documentNumber,
        fiscalYear,
        companyCode: doc.companyCode,
        raw: { exportFileKey: csvKey, xlsxKey: `${base}.xlsx` },
      };
    });
  }
}
