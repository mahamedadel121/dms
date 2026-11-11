// Pure model for the web request-submission form (P2-D1). No React, no network.
import {
  ATTACHMENT_MIME_TYPES,
  normalizeDigits,
  parseAmount,
  sumDecimals,
  type FieldDefinition,
  type LineCategoryDto,
  type RequestTypeDto,
  type SubmitRequestBody,
} from '@dms/shared';

export interface UploadedFile {
  id: string;
  name: string;
  mimeType: string;
}
export interface LineDraft {
  uid: string;
  categoryId: string;
  amount: string;
  extra: Record<string, string>;
  files: UploadedFile[];
  note: string;
}
export interface SubmitDraft {
  header: Record<string, string>;
  lines: LineDraft[];
}
export type IssueCode = 'required' | 'number' | 'min' | 'max' | 'regex' | 'option' | 'date' | 'amount' | 'category' | 'minFiles' | 'maxFiles' | 'noLines';
export interface Issue {
  code: IssueCode;
  params?: Record<string, string | number>;
}
/** keys: `h.<fieldKey>`, `l<i>.<fieldKey>`, `l<i>.amount`, `l<i>.category`, `l<i>.files`, `lines` */
export type IssueMap = Record<string, Issue>;

export const headerKey = (k: string) => `h.${k}`;
export const lineKey = (i: number, k: string) => `l${i}.${k}`;

/** Types the web form can offer: active, WEB channel, (with or without lines). */
export function webTypes(types: RequestTypeDto[]): RequestTypeDto[] {
  return types.filter((t) => t.isActive && t.channels.includes('WEB'));
}

export const sortedFields = (fields: FieldDefinition[]): FieldDefinition[] => [...fields].sort((a, b) => a.order - b.order);
export const activeCategories = (cats: LineCategoryDto[] | undefined): LineCategoryDto[] =>
  [...(cats ?? [])].filter((c) => c.isActive).sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code));

export function newLine(uid: string, categoryId = ''): LineDraft {
  return { uid, categoryId, amount: '', extra: {}, files: [], note: '' };
}

/** Mirrors the engine's validateFieldValues (see packages/core/src/engine/helpers.ts). */
export function validateFields(fields: FieldDefinition[], values: Record<string, string>, key: (k: string) => string): IssueMap {
  const out: IssueMap = {};
  for (const f of fields) {
    const raw = values[f.key];
    if (raw === undefined || raw.trim() === '') {
      if (f.required) out[key(f.key)] = { code: 'required' };
      continue;
    }
    const v = raw.trim();
    if (f.type === 'number') {
      const n = normalizeDigits(v);
      if (!/^-?\d+(\.\d+)?$/.test(n)) {
        out[key(f.key)] = { code: 'number' };
        continue;
      }
      if (f.min !== undefined && Number(n) < f.min) out[key(f.key)] = { code: 'min', params: { min: f.min } };
      else if (f.max !== undefined && Number(n) > f.max) out[key(f.key)] = { code: 'max', params: { max: f.max } };
    } else if (f.type === 'select') {
      if (f.options && !f.options.some((o) => o.value === v)) out[key(f.key)] = { code: 'option' };
    } else if (f.type === 'date') {
      if (!/^\d{4}-\d{2}-\d{2}/.test(v)) out[key(f.key)] = { code: 'date' };
    }
    if (!out[key(f.key)] && f.regex) {
      try {
        if (!new RegExp(f.regex).test(v)) out[key(f.key)] = { code: 'regex' };
      } catch {
        /* bad regex in config: ignore, like the engine */
      }
    }
  }
  return out;
}

export const acceptedMimeTypes = (cat: LineCategoryDto | undefined): string[] =>
  cat && cat.allowedMimeTypes.length ? cat.allowedMimeTypes : [...ATTACHMENT_MIME_TYPES];

export type FileCheck = { ok: true } | { ok: false; code: 'type' | 'max' };
/** Attachment rule check for one more file on a line. */
export function checkFile(cat: LineCategoryDto | undefined, currentCount: number, mimeType: string): FileCheck {
  if (!cat) return { ok: false, code: 'type' };
  if (currentCount >= cat.maxAttachments) return { ok: false, code: 'max' };
  if (!acceptedMimeTypes(cat).includes(mimeType)) return { ok: false, code: 'type' };
  return { ok: true };
}

export function validateDraft(type: Pick<RequestTypeDto, 'headerFields' | 'hasLines'>, cats: LineCategoryDto[], draft: SubmitDraft): IssueMap {
  const out: IssueMap = { ...validateFields(type.headerFields, draft.header, headerKey) };
  if (!type.hasLines) return out;
  if (draft.lines.length === 0) out.lines = { code: 'noLines' };
  const byId = new Map(cats.map((c) => [c.id, c]));
  draft.lines.forEach((l, i) => {
    const cat = byId.get(l.categoryId);
    if (!cat) {
      out[lineKey(i, 'category')] = { code: 'category' };
      return;
    }
    if (!l.amount.trim() || !parseAmount(normalizeDigits(l.amount.trim()))) out[lineKey(i, 'amount')] = { code: 'amount' };
    Object.assign(out, validateFields(cat.extraFields, l.extra, (k) => lineKey(i, k)));
    if (l.files.length < cat.minAttachments) out[lineKey(i, 'files')] = { code: 'minFiles', params: { min: cat.minAttachments } };
    else if (l.files.length > cat.maxAttachments) out[lineKey(i, 'files')] = { code: 'maxFiles', params: { max: cat.maxAttachments } };
  });
  return out;
}

const normAmount = (s: string): string => parseAmount(normalizeDigits(s.trim())) ?? '0';

/** Total of the valid line amounts (invalid ones count as 0). */
export function draftTotal(lines: LineDraft[]): string {
  return sumDecimals(lines.map((l) => normAmount(l.amount)));
}

const clean = (m: Record<string, string>): Record<string, string> => {
  const o: Record<string, string> = {};
  for (const [k, v] of Object.entries(m)) if (v.trim() !== '') o[k] = v.trim();
  return o;
};

/** Number fields go out as normalised ASCII-digit numbers, everything else as trimmed strings. */
export function normaliseHeader(fields: FieldDefinition[], header: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(clean(header))) {
    const def = fields.find((f) => f.key === k);
    out[k] = def?.type === 'number' ? Number(normalizeDigits(v)) : v;
  }
  return out;
}

export function buildCreateBody(type: Pick<RequestTypeDto, 'code' | 'headerFields' | 'hasLines'>, cats: LineCategoryDto[], draft: SubmitDraft, clientKey: string): SubmitRequestBody {
  const byId = new Map(cats.map((c) => [c.id, c]));
  return {
    requestTypeCode: type.code,
    clientKey,
    headerValues: normaliseHeader(type.headerFields, draft.header),
    lines: (type.hasLines ? draft.lines : []).map((l) => {
      const cat = byId.get(l.categoryId);
      const extra = clean(l.extra);
      for (const f of cat?.extraFields ?? []) if (f.type === 'number' && extra[f.key]) extra[f.key] = normalizeDigits(extra[f.key]);
      return {
        categoryId: l.categoryId,
        amount: normAmount(l.amount),
        ...(Object.keys(extra).length ? { extraValues: extra } : {}),
        attachmentIds: l.files.map((f) => f.id),
        ...(l.note.trim() ? { note: l.note.trim() } : {}),
      };
    }),
  };
}

/** Maps an engine message (`header field "x" is required`, `line 2 field "y" ...`) onto a form key. */
export function issueKeyFromServer(message: string): string | null {
  const m = /^(?:header field|line (\d+) field) "([^"]+)"/.exec(message);
  if (!m) return null;
  return m[1] ? lineKey(Number(m[1]) - 1, m[2]) : headerKey(m[2]);
}
