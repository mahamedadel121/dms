import ExcelJS from 'exceljs';
import Decimal from 'decimal.js';
import type { GroupBy, ReportRow, ReportTotals } from './types';
import type { ReportRowG } from './query';

const COLUMNS: { header: string; key: string; width: number; money?: boolean }[] = [
  { header: 'Request No.', key: 'requestNumber', width: 16 },
  { header: 'Submitted', key: 'submittedAt', width: 18 },
  { header: 'Paid', key: 'paidAt', width: 18 },
  { header: 'Expense date', key: 'lineDate', width: 12 },
  { header: 'Status', key: 'status', width: 14 },
  { header: 'Driver', key: 'driverName', width: 22 },
  { header: 'Vehicle', key: 'vehicleNumber', width: 10 },
  { header: 'Cost center', key: 'costCenterCode', width: 12 },
  { header: 'Expense type', key: 'expenseTypeEn', width: 20 },
  { header: 'GL account', key: 'glNumber', width: 12 },
  { header: 'Original amount', key: 'originalAmount', width: 16, money: true },
  { header: 'Final amount', key: 'finalAmount', width: 16, money: true },
  { header: 'Liters', key: 'liters', width: 9 },
  { header: 'Price / liter', key: 'pricePerLiter', width: 11 },
  { header: 'Odometer', key: 'odometer', width: 10 },
  { header: 'Approvers', key: 'approvers', width: 50 },
  { header: 'SAP document', key: 'sapDocNumber', width: 14 },
  { header: 'Images', key: 'imageCount', width: 8 },
  { header: 'Link', key: 'link', width: 30 },
];

const MONEY_FMT = '#,##0.00';
const num = (v: string | null | undefined): number | null => (v === null || v === undefined || v === '' ? null : Number(v));
const day = (iso: string | null): string => (iso ? iso.slice(0, 10) : '');
const stamp = (iso: string | null): string => (iso ? iso.replace('T', ' ').slice(0, 16) : '');

function rowValues(r: ReportRow, baseUrl: string): Record<string, unknown> {
  return {
    requestNumber: r.requestNumber,
    submittedAt: stamp(r.submittedAt),
    paidAt: stamp(r.paidAt),
    lineDate: day(r.lineDate),
    status: r.status,
    driverName: r.driverName ?? '',
    vehicleNumber: r.vehicleNumber ?? '',
    costCenterCode: r.costCenterCode ?? '',
    expenseTypeEn: r.expenseTypeEn,
    glNumber: r.glNumber ?? '',
    originalAmount: num(r.originalAmount),
    finalAmount: num(r.finalAmount),
    liters: num(r.liters),
    pricePerLiter: num(r.pricePerLiter),
    odometer: r.odometer,
    approvers: r.approvers.map((a) => `${a.roleNameEn}: ${a.userName ?? '-'} (${stamp(a.actedAt)})`).join('; '),
    sapDocNumber: r.sapDocNumber ?? '',
    imageCount: r.imageCount,
    link: `${baseUrl}${r.link}`,
  };
}

function styleHeader(ws: ExcelJS.Worksheet): void {
  const h = ws.getRow(1);
  h.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3A5F' } };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

export interface WorkbookInput {
  rows: ReportRowG[];
  groupBy?: GroupBy;
  totals: ReportTotals;
  baseUrl?: string;
}

/** Report sheet with per-group subtotal rows (when groupBy) and a grand total row. */
export function addReportSheet(wb: ExcelJS.Workbook, input: WorkbookInput, name = 'Report'): void {
  const ws = wb.addWorksheet(name);
  ws.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width, style: c.money ? { numFmt: MONEY_FMT } : {} }));
  styleHeader(ws);
  const base = input.baseUrl ?? '';
  const totalRow = (label: string, count: number, o: Decimal, f: Decimal, bold: boolean, fill: string) => {
    const row = ws.addRow({ requestNumber: label, expenseTypeEn: `${count} line(s)`, originalAmount: o.toNumber(), finalAmount: f.toNumber() });
    row.font = { bold };
    row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
  };
  let cur: string | undefined;
  let cnt = 0;
  let so = new Decimal(0);
  let sf = new Decimal(0);
  const flush = () => {
    if (input.groupBy && cur !== undefined) totalRow(`Subtotal: ${cur}`, cnt, so, sf, true, 'FFE8EEF7');
    cnt = 0;
    so = new Decimal(0);
    sf = new Decimal(0);
  };
  for (const r of input.rows) {
    if (input.groupBy) {
      const label = r.groupLabel ?? '';
      if (cur !== label) {
        flush();
        cur = label;
      }
    }
    ws.addRow(rowValues(r, base));
    cnt++;
    so = so.plus(r.originalAmount);
    sf = sf.plus(r.finalAmount);
  }
  flush();
  totalRow('Grand total', input.totals.count, new Decimal(input.totals.originalTotal), new Decimal(input.totals.finalTotal), true, 'FFD6E0F0');
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUMNS.length } };
}

export async function buildReportWorkbook(input: WorkbookInput): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'DMS';
  addReportSheet(wb, input);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export interface ImageIndexRow {
  requestNumber: string;
  lineNo: number;
  expenseType: string;
  path: string;
  originalName: string | null;
  sha256: string;
  mimeType: string;
  sizeBytes: number;
  status: 'OK' | 'MISSING';
}

export async function buildIndexWorkbook(input: WorkbookInput, images: ImageIndexRow[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'DMS';
  addReportSheet(wb, input);
  const ws = wb.addWorksheet('Images');
  ws.columns = [
    { header: 'Request No.', key: 'requestNumber', width: 16 },
    { header: 'Line', key: 'lineNo', width: 6 },
    { header: 'Expense type', key: 'expenseType', width: 20 },
    { header: 'File in ZIP', key: 'path', width: 60 },
    { header: 'Original name', key: 'originalName', width: 24 },
    { header: 'Type', key: 'mimeType', width: 16 },
    { header: 'Size (bytes)', key: 'sizeBytes', width: 12 },
    { header: 'SHA-256', key: 'sha256', width: 66 },
    { header: 'Status', key: 'status', width: 10 },
  ];
  styleHeader(ws);
  for (const i of images) ws.addRow(i);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
