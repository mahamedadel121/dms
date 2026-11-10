import {
  ATTACHMENT_MIME_TYPES,
  EXPENSE_RESERVED_HEADER_KEYS,
  fieldDefinitionIssues,
  type AttachmentMimeType,
  type FieldDefinition,
  type FieldIssue,
  type LineCategoryDto,
  type LineCategoryInput,
  type RequestTypeDto,
  type RequestTypeInput,
} from '@dms/shared';

export const EXPENSE_RESERVED_KEYS: string[] = [...EXPENSE_RESERVED_HEADER_KEYS];
export const LOOKUP_ENTITIES = ['vehicles', 'submitters', 'cost-centers', 'gl-accounts', 'treasuries', 'departments'] as const;
export const FIELD_TYPES = ['text', 'number', 'date', 'select', 'lookup'] as const;
export const MIME_LABELS: Record<AttachmentMimeType, string> = {
  'image/jpeg': 'JPEG',
  'image/png': 'PNG',
  'image/webp': 'WebP',
  'application/pdf': 'PDF',
};

export type Channel = 'TELEGRAM' | 'WEB';

export interface TypeForm {
  code: string;
  numberPrefix: string;
  nameAr: string;
  nameEn: string;
  departmentId: string;
  moduleKey: string;
  channels: Channel[];
  hasLines: boolean;
  isActive: boolean;
  headerFields: FieldDefinition[];
}

export interface CategoryForm {
  code: string;
  nameAr: string;
  nameEn: string;
  icon: string;
  sortOrder: number;
  isActive: boolean;
  extraFields: FieldDefinition[];
  quantityFieldKey: string;
  unitPriceMin: string;
  unitPriceMax: string;
  maxAmountWarning: string;
  minAttachments: number;
  maxAttachments: number;
  approvalRoleIds: string[];
  allowedMimeTypes: AttachmentMimeType[];
}

export const EMPTY_TYPE_FORM: TypeForm = {
  code: '',
  numberPrefix: '',
  nameAr: '',
  nameEn: '',
  departmentId: '',
  moduleKey: '',
  channels: ['TELEGRAM', 'WEB'],
  hasLines: true,
  isActive: true,
  headerFields: [],
};

export function emptyCategoryForm(sortOrder = 0): CategoryForm {
  return {
    code: '',
    nameAr: '',
    nameEn: '',
    icon: '',
    sortOrder,
    isActive: true,
    extraFields: [],
    quantityFieldKey: '',
    unitPriceMin: '',
    unitPriceMax: '',
    maxAmountWarning: '',
    minAttachments: 1,
    maxAttachments: 10,
    approvalRoleIds: [],
    allowedMimeTypes: [...ATTACHMENT_MIME_TYPES],
  };
}

// ---------------------------------------------------------------- fields

/** A new text field with a key that is not in `existingKeys`. */
export function blankField(existingKeys: string[]): FieldDefinition {
  const taken = new Set(existingKeys);
  let n = existingKeys.length + 1;
  while (taken.has(`field${n}`)) n++;
  return { key: `field${n}`, labelAr: '', labelEn: '', type: 'text', required: false, order: existingKeys.length * 10 };
}

/** Rewrites `order` as index * 10. */
export function normalizeOrder(fields: FieldDefinition[]): FieldDefinition[] {
  return fields.map((f, i) => ({ ...f, order: i * 10 }));
}

const ISSUE_FIELD: Record<FieldIssue['code'], string> = {
  KEY_FORMAT: 'key',
  KEY_DUPLICATE: 'key',
  KEY_RESERVED: 'key',
  OPTIONS_REQUIRED: 'options',
  LOOKUP_REQUIRED: 'lookup',
  MIN_GT_MAX: 'max',
  REGEX_INVALID: 'regex',
};

/**
 * Row index -> { column: i18n key of the message }. Uses the shared structural checks plus empty labels.
 * Messages are `rt.err.<CODE>` keys; the UI translates them.
 */
export function validateFields(fields: FieldDefinition[], reserved: string[] = []): Record<number, Record<string, string>> {
  const out: Record<number, Record<string, string>> = {};
  const put = (i: number, col: string, msg: string) => {
    const row = (out[i] ??= {});
    row[col] ??= msg;
  };
  for (const issue of fieldDefinitionIssues(fields, reserved)) put(issue.index, ISSUE_FIELD[issue.code], `rt.err.${issue.code}`);
  fields.forEach((f, i) => {
    if (!f.labelAr.trim()) put(i, 'labelAr', 'rt.err.REQUIRED');
    if (!f.labelEn.trim()) put(i, 'labelEn', 'rt.err.REQUIRED');
    if (f.type === 'select') {
      for (const o of f.options ?? []) {
        if (!o.value.trim() || !o.labelAr.trim() || !o.labelEn.trim()) put(i, 'options', 'rt.err.OPTION_EMPTY');
      }
    }
  });
  return out;
}

export function hasFieldErrors(e: Record<number, Record<string, string>>): boolean {
  return Object.keys(e).length > 0;
}

// ---------------------------------------------------------------- request type

const clean = (s: string) => s.trim();

export function toTypeInput(form: TypeForm): RequestTypeInput {
  return {
    code: clean(form.code).toUpperCase(),
    numberPrefix: clean(form.numberPrefix).toUpperCase(),
    nameAr: clean(form.nameAr),
    nameEn: clean(form.nameEn),
    departmentId: form.departmentId || null,
    moduleKey: form.moduleKey || null,
    headerFields: normalizeOrder(form.headerFields),
    hasLines: form.hasLines,
    channels: [...form.channels],
    settings: {},
    isActive: form.isActive,
  };
}

/** Only the keys that differ from `original` (code and prefix are immutable and never sent). */
export function toTypeUpdate(form: TypeForm, original: RequestTypeDto): Partial<Omit<RequestTypeInput, 'code' | 'numberPrefix'>> {
  const next = toTypeInput(form);
  const out: Partial<Omit<RequestTypeInput, 'code' | 'numberPrefix'>> = {};
  if (next.nameAr !== original.nameAr) out.nameAr = next.nameAr;
  if (next.nameEn !== original.nameEn) out.nameEn = next.nameEn;
  if ((next.departmentId ?? null) !== (original.departmentId ?? null)) out.departmentId = next.departmentId;
  if ((next.moduleKey ?? null) !== (original.moduleKey ?? null)) out.moduleKey = next.moduleKey;
  if (next.hasLines !== original.hasLines) out.hasLines = next.hasLines;
  if (next.isActive !== original.isActive) out.isActive = next.isActive;
  if ([...next.channels].sort().join('|') !== [...original.channels].sort().join('|')) out.channels = next.channels;
  if (JSON.stringify(next.headerFields) !== JSON.stringify(normalizeOrder(original.headerFields))) out.headerFields = next.headerFields;
  return out;
}

export function typeToForm(t: RequestTypeDto): TypeForm {
  return {
    code: t.code,
    numberPrefix: t.numberPrefix,
    nameAr: t.nameAr,
    nameEn: t.nameEn,
    departmentId: t.departmentId ?? '',
    moduleKey: t.moduleKey ?? '',
    channels: t.channels.filter((c): c is Channel => c === 'TELEGRAM' || c === 'WEB'),
    hasLines: t.hasLines,
    isActive: t.isActive,
    headerFields: normalizeOrder(t.headerFields),
  };
}

/** field -> i18n key of the message (empty object = valid). */
export function validateType(form: TypeForm, mode: 'create' | 'edit' = 'create'): Record<string, string> {
  const e: Record<string, string> = {};
  if (mode === 'create') {
    const code = clean(form.code).toUpperCase();
    if (!code) e.code = 'rt.err.REQUIRED';
    else if (!/^[A-Z0-9_]+$/.test(code) || code.length > 40) e.code = 'rt.err.CODE_FORMAT';
    const prefix = clean(form.numberPrefix).toUpperCase();
    if (!prefix) e.numberPrefix = 'rt.err.REQUIRED';
    else if (!/^[A-Z0-9]+$/.test(prefix) || prefix.length > 4) e.numberPrefix = 'rt.err.PREFIX_FORMAT';
  }
  if (!clean(form.nameAr)) e.nameAr = 'rt.err.REQUIRED';
  if (!clean(form.nameEn)) e.nameEn = 'rt.err.REQUIRED';
  if (form.channels.length === 0) e.channels = 'rt.err.CHANNEL_REQUIRED';
  return e;
}

// ---------------------------------------------------------------- categories

const orNull = (s: string): string | null => (s.trim() === '' ? null : s.trim());

export function toCategoryInput(form: CategoryForm): LineCategoryInput {
  return {
    code: clean(form.code).toUpperCase(),
    nameAr: clean(form.nameAr),
    nameEn: clean(form.nameEn),
    icon: orNull(form.icon),
    sortOrder: form.sortOrder,
    isActive: form.isActive,
    extraFields: normalizeOrder(form.extraFields),
    quantityFieldKey: orNull(form.quantityFieldKey),
    unitPriceMin: orNull(form.unitPriceMin),
    unitPriceMax: orNull(form.unitPriceMax),
    minAttachments: form.minAttachments,
    maxAttachments: form.maxAttachments,
    maxAmountWarning: orNull(form.maxAmountWarning),
    approvalRoleIds: [...form.approvalRoleIds],
    allowedMimeTypes: form.allowedMimeTypes.length ? [...form.allowedMimeTypes] : undefined,
  };
}

export function categoryToForm(c: LineCategoryDto): CategoryForm {
  return {
    code: c.code,
    nameAr: c.nameAr,
    nameEn: c.nameEn,
    icon: c.icon ?? '',
    sortOrder: c.sortOrder,
    isActive: c.isActive,
    extraFields: normalizeOrder(c.extraFields),
    quantityFieldKey: c.quantityFieldKey ?? '',
    unitPriceMin: c.unitPriceMin ?? '',
    unitPriceMax: c.unitPriceMax ?? '',
    maxAmountWarning: c.maxAmountWarning ?? '',
    minAttachments: c.minAttachments,
    maxAttachments: c.maxAttachments,
    approvalRoleIds: [...c.approvalRoleIds],
    allowedMimeTypes: c.allowedMimeTypes.filter((m): m is AttachmentMimeType => (ATTACHMENT_MIME_TYPES as readonly string[]).includes(m)),
  };
}

const MONEY = /^\d+(\.\d{1,4})?$/;

export function validateCategory(form: CategoryForm, mode: 'create' | 'edit' = 'create'): Record<string, string> {
  const e: Record<string, string> = {};
  if (mode === 'create') {
    const code = clean(form.code);
    if (!code) e.code = 'rt.err.REQUIRED';
    else if (code.length > 40) e.code = 'rt.err.CODE_FORMAT';
  }
  if (!clean(form.nameAr)) e.nameAr = 'rt.err.REQUIRED';
  if (!clean(form.nameEn)) e.nameEn = 'rt.err.REQUIRED';
  for (const k of ['unitPriceMin', 'unitPriceMax', 'maxAmountWarning'] as const) {
    if (form[k].trim() && !MONEY.test(form[k].trim())) e[k] = 'rt.err.MONEY';
  }
  if (form.minAttachments > form.maxAttachments) e.maxAttachments = 'rt.err.ATTACH_RANGE';
  if (form.allowedMimeTypes.length === 0) e.allowedMimeTypes = 'rt.err.MIME_REQUIRED';
  if (form.quantityFieldKey && !form.extraFields.some((f) => f.key === form.quantityFieldKey && f.type === 'number')) {
    e.quantityFieldKey = 'rt.err.QUANTITY_FIELD';
  }
  return e;
}

/** Attachment rule of a category as "1-10". */
export function attachmentRule(c: Pick<LineCategoryDto, 'minAttachments' | 'maxAttachments'>): string {
  return `${c.minAttachments}-${c.maxAttachments}`;
}

/** Partial PATCH body for the attachments grid, or null when nothing changed. */
export function attachmentPatch(
  original: Pick<LineCategoryDto, 'minAttachments' | 'maxAttachments' | 'allowedMimeTypes'>,
  edit: { minAttachments: number; maxAttachments: number; allowedMimeTypes: AttachmentMimeType[] },
): Pick<LineCategoryInput, 'minAttachments' | 'maxAttachments' | 'allowedMimeTypes'> | null {
  const same =
    original.minAttachments === edit.minAttachments &&
    original.maxAttachments === edit.maxAttachments &&
    [...original.allowedMimeTypes].sort().join('|') === [...edit.allowedMimeTypes].sort().join('|');
  if (same) return null;
  return { minAttachments: edit.minAttachments, maxAttachments: edit.maxAttachments, allowedMimeTypes: edit.allowedMimeTypes.length ? edit.allowedMimeTypes : undefined };
}
