import { dec, formatCairo, templateConfigSchema, toFixed2, type TemplateConfig } from '@dms/shared';
import type { Db } from '../common';
import { getSetting } from '../config';
import { DomainError } from '../errors';
import { getStorage, type StorageAdapter } from '../storage';
import { amountToArabicWords } from './amountWords';

export interface SignatureBlock {
  kind: 'SUBMITTER' | 'STEP';
  /** role title (Arabic) or the submitter label */
  title: string;
  name: string;
  /** "عن <delegator>" when the step was approved through a delegation */
  onBehalfOf?: string;
  imageDataUri?: string;
  /** formatted Africa/Cairo date-time */
  at?: string;
  stepInstanceId?: string;
}

export interface DocumentModel {
  layoutKey: string;
  requestNumber: string;
  status: string;
  /** false = preview (banner shown) */
  isFinal: boolean;
  titleAr: string;
  titleEn?: string;
  companyNameAr?: string;
  logoDataUri?: string;
  footerNoteAr?: string;
  headerRows: { key: string; label: string; value: string }[];
  columns: { key: string; label: string }[];
  lines: { cells: Record<string, string>; edited: boolean }[];
  currency: string;
  totalFinal: string;
  totalOriginal: string;
  showOriginalTotal: boolean;
  amountWords?: string;
  signatures: SignatureBlock[];
  signaturePerRow: number;
  showDateTime: boolean;
}

export interface ModelOptions {
  templateConfig?: TemplateConfig;
  storage?: StorageAdapter;
}

export function fmtMoney(v: unknown): string {
  if (v === null || v === undefined || v === '') return '';
  const s = toFixed2(v as string);
  const [i, f] = s.split('.') as [string, string];
  return `${i.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${f}`;
}

function fmtQty(v: unknown): string {
  if (v === null || v === undefined || v === '') return '';
  const d = dec(v as string);
  return d.toFixed(3).replace(/\.?0+$/, '');
}

function sniffImageMime(b: Buffer): string | null {
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
  if (b.length > 12 && b.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  return null;
}

/** Reads an image from storage as a data URI; undefined when missing/unreadable/not an image. */
export async function imageDataUri(
  storage: StorageAdapter | undefined,
  key: string | null | undefined,
): Promise<string | undefined> {
  if (!storage || !key) return undefined;
  try {
    const bytes = await storage.get(key);
    const mime = sniffImageMime(bytes);
    if (!mime) return undefined;
    return `data:${mime};base64,${bytes.toString('base64')}`;
  } catch {
    return undefined;
  }
}

function resolveStorage(o?: ModelOptions): StorageAdapter | undefined {
  if (o?.storage) return o.storage;
  try {
    return getStorage();
  } catch {
    return undefined; // storage unavailable: images are simply omitted
  }
}

export const DEFAULT_TEMPLATE_CONFIG: TemplateConfig = {
  titleAr: 'طلب',
  titleEn: 'Request',
  headerFields: [
    { key: 'requestNumber', labelAr: 'رقم الطلب', show: true },
    { key: 'submittedAt', labelAr: 'التاريخ', show: true },
    { key: 'submitterName', labelAr: 'مقدم الطلب', show: true },
  ],
  lineColumns: [
    { key: 'category', labelAr: 'البند', show: true },
    { key: 'originalAmount', labelAr: 'المبلغ الأصلي', show: true },
    { key: 'amount', labelAr: 'المبلغ', show: true },
    { key: 'quantity', labelAr: 'الكمية', show: true },
    { key: 'unitPrice', labelAr: 'سعر الوحدة', show: true },
    { key: 'note', labelAr: 'ملاحظات', show: false },
  ],
  showOriginalValues: true,
  showAmountInWords: true,
  signature: { perRow: 4, showDateTime: true, submitterLabelAr: 'مقدم الطلب' },
};

export async function loadTemplateConfig(
  db: Db,
  templateVersionId: string | null,
): Promise<{ config: TemplateConfig; layoutKey: string }> {
  if (templateVersionId) {
    const tv = await db.templateVersion.findUnique({ where: { id: templateVersionId } });
    if (tv) return { config: templateConfigSchema.parse(tv.config), layoutKey: tv.layoutKey };
  }
  return { config: DEFAULT_TEMPLATE_CONFIG, layoutKey: 'generic-request' };
}

function columnsOf(cfg: TemplateConfig): { key: string; label: string }[] {
  return cfg.lineColumns
    .filter((c) => c.show && (c.key !== 'originalAmount' || cfg.showOriginalValues))
    .map((c) => ({ key: c.key as string, label: c.labelAr }));
}

export async function buildDocumentModel(db: Db, requestId: string, o?: ModelOptions): Promise<DocumentModel> {
  const req = await db.request.findUnique({
    where: { id: requestId },
    include: {
      submitter: true,
      submittedByUser: true,
      expense: true,
      lines: { include: { category: true }, orderBy: { lineNo: 'asc' } },
      stepInstances: {
        where: { status: 'APPROVED' },
        include: { actedBy: true, onBehalfOf: true, signature: true, workflowStep: true },
        orderBy: { sortOrder: 'asc' },
      },
      submitterSignature: true,
    },
  });
  if (!req) throw new DomainError('NOT_FOUND', 'Request not found');
  const storage = resolveStorage(o);
  const loaded = await loadTemplateConfig(db, req.templateVersionId);
  const cfg = o?.templateConfig ?? loaded.config;
  const company = await getSetting(db, 'company.profile');

  const submitterName = req.submitter?.fullName ?? req.submittedByUser?.fullName ?? '';
  const header: Record<string, string> = {
    requestNumber: req.number,
    submittedAt: formatCairo(req.submittedAt),
    submitterName,
    vehicleNumber: req.expense?.vehicleNumber ?? '',
    vehicleType: req.expense?.vehicleTypeName ?? '',
    costCenter: req.expense?.costCenterCode ?? '',
    odometer: req.expense ? String(req.expense.odometer) : '',
  };
  const hv = (req.headerValues ?? {}) as Record<string, unknown>;
  const headerRows = cfg.headerFields
    .filter((f) => f.show)
    .map((f) => {
      let v = header[f.key];
      if (v === undefined || v === '') {
        const x = hv[f.key];
        v = x === undefined || x === null ? '' : String(x);
      }
      return { key: f.key, label: f.labelAr, value: v || '—' };
    });

  // line order: categoryOrder (ids or codes) first, the rest by category sortOrder then lineNo
  const order = cfg.categoryOrder ?? [];
  const rank = (l: (typeof req.lines)[number]): number => {
    const i = order.findIndex((k) => k === l.categoryId || k === l.category.code);
    return i >= 0 ? i : order.length + l.category.sortOrder;
  };
  const lines = [...req.lines].sort((a, b) => rank(a) - rank(b) || a.lineNo - b.lineNo);

  const columns = columnsOf(cfg);
  const rows = lines.map((l) => {
    const extra = (l.extraValues ?? {}) as Record<string, unknown>;
    const cells: Record<string, string> = {};
    for (const c of columns) {
      if (c.key === 'category') cells[c.key] = l.categoryNameAr;
      else if (c.key === 'originalAmount') cells[c.key] = fmtMoney(l.originalAmount);
      else if (c.key === 'amount') cells[c.key] = fmtMoney(l.amount);
      else if (c.key === 'quantity') cells[c.key] = fmtQty(l.quantity);
      else if (c.key === 'unitPrice') cells[c.key] = fmtMoney(l.unitPrice);
      else if (c.key === 'note') cells[c.key] = l.note ?? '';
      else if (c.key.startsWith('extra.')) {
        const v = extra[c.key.slice(6)];
        cells[c.key] = v === undefined || v === null ? '' : String(v);
      }
    }
    return { cells, edited: l.isEdited || !dec(l.amount.toString()).eq(dec(l.originalAmount.toString())) };
  });

  // signatures: the submitter + APPROVED instances flagged showInSignatures.
  // NOT_APPLICABLE / pending steps are never loaded, so the sheet matches the workflow that ran.
  const signatures: SignatureBlock[] = [
    {
      kind: 'SUBMITTER',
      title: cfg.signature.submitterLabelAr,
      name: submitterName || '—',
      imageDataUri: await imageDataUri(storage, req.submitterSignature?.storageKey),
      at: formatCairo(req.submittedAt, { dateOnly: !cfg.signature.showDateTime }),
    },
  ];
  for (const si of req.stepInstances) {
    if (!si.workflowStep.showInSignatures) continue;
    signatures.push({
      kind: 'STEP',
      title: si.roleNameAr,
      name: si.actedBy?.fullName ?? '—',
      onBehalfOf: si.onBehalfOf ? `عن ${si.onBehalfOf.fullName}` : undefined,
      imageDataUri: await imageDataUri(storage, si.signature?.storageKey),
      at: si.actedAt ? formatCairo(si.actedAt, { dateOnly: !cfg.signature.showDateTime }) : undefined,
      stepInstanceId: si.id,
    });
  }

  const totalFinal = toFixed2(req.totalFinal.toString());
  const totalOriginal = toFixed2(req.totalOriginal.toString());
  return {
    layoutKey: loaded.layoutKey,
    requestNumber: req.number,
    status: req.status,
    isFinal: req.status === 'PAID',
    titleAr: cfg.titleAr,
    titleEn: cfg.titleEn,
    companyNameAr: cfg.companyNameAr ?? company.nameAr,
    logoDataUri: await imageDataUri(storage, cfg.logoKey ?? company.logoKey),
    footerNoteAr: cfg.footerNoteAr,
    headerRows,
    columns,
    lines: rows,
    currency: req.currency,
    totalFinal,
    totalOriginal,
    showOriginalTotal: cfg.showOriginalValues && totalFinal !== totalOriginal,
    amountWords: cfg.showAmountInWords ? amountToArabicWords(totalFinal) : undefined,
    signatures,
    signaturePerRow: cfg.signature.perRow,
    showDateTime: cfg.signature.showDateTime,
  };
}

/** Sample data for the template editor when no request is chosen. */
export function buildSampleDocumentModel(cfg: TemplateConfig, layoutKey = 'expense-sheet'): DocumentModel {
  const sample: Record<string, string> = {
    requestNumber: 'DE-26-000123',
    submittedAt: '2026-01-15 09:30',
    submitterName: 'محمد أحمد',
    vehicleNumber: '2157',
    vehicleType: 'ميكروباص',
    costCenter: 'MLF450',
    odometer: '154200',
  };
  const columns = columnsOf(cfg);
  const mk = (cat: string, orig: string, amt: string, q: string, up: string) => {
    const vals: Record<string, string> = { category: cat, originalAmount: orig, amount: amt, quantity: q, unitPrice: up, note: '' };
    const cells: Record<string, string> = {};
    for (const c of columns) cells[c.key] = vals[c.key] ?? '';
    return { cells, edited: orig !== amt };
  };
  const total = '1250.50';
  return {
    layoutKey,
    requestNumber: sample.requestNumber!,
    status: 'IN_REVIEW',
    isFinal: false,
    titleAr: cfg.titleAr,
    titleEn: cfg.titleEn,
    companyNameAr: cfg.companyNameAr,
    footerNoteAr: cfg.footerNoteAr,
    headerRows: cfg.headerFields
      .filter((f) => f.show)
      .map((f) => ({ key: f.key, label: f.labelAr, value: sample[f.key] ?? '—' })),
    columns,
    lines: [mk('سولار', '800.00', '750.50', '100', '7.51'), mk('رسوم طريق', '500.00', '500.00', '', '')],
    currency: 'EGP',
    totalFinal: total,
    totalOriginal: '1300.00',
    showOriginalTotal: cfg.showOriginalValues,
    amountWords: cfg.showAmountInWords ? amountToArabicWords(total) : undefined,
    signatures: [
      { kind: 'SUBMITTER', title: cfg.signature.submitterLabelAr, name: sample.submitterName!, at: sample.submittedAt },
      { kind: 'STEP', title: 'المحاسب', name: 'اسم المعتمد', at: '2026-01-15 11:00' },
    ],
    signaturePerRow: cfg.signature.perRow,
    showDateTime: cfg.signature.showDateTime,
  };
}
