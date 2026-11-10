import { z } from 'zod';

// ---------- FieldDefinition (PLAN 3.2) ----------
export const fieldOptionSchema = z.object({
  value: z.string(),
  labelAr: z.string(),
  labelEn: z.string(),
});

export const fieldDefinitionSchema = z.object({
  key: z.string().min(1),
  labelAr: z.string(),
  labelEn: z.string(),
  type: z.enum(['text', 'number', 'date', 'select', 'lookup']),
  required: z.boolean(),
  options: z.array(fieldOptionSchema).optional(),
  lookup: z.string().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  regex: z.string().optional(),
  promptAr: z.string().optional(),
  order: z.number().int(),
});
export type FieldDefinition = z.infer<typeof fieldDefinitionSchema>;
export const fieldDefinitionsSchema = z.array(fieldDefinitionSchema);

export const checklistItemSchema = z.object({
  key: z.string().min(1),
  labelAr: z.string(),
  labelEn: z.string(),
  required: z.boolean(),
});
export type ChecklistItem = z.infer<typeof checklistItemSchema>;
export const checklistSchema = z.array(checklistItemSchema);

// ---------- Condition (PLAN 5.2) ----------
export type Condition =
  | { type: 'ALWAYS' }
  | { type: 'LINE_CATEGORY_REQUIRES_ROLE' }
  | { type: 'LINE_CATEGORY_IN'; categoryCodes: string[] }
  | { type: 'TOTAL_AMOUNT'; op: 'gt' | 'gte' | 'lt' | 'lte' | 'eq'; value: string }
  | {
      type: 'FIELD';
      field: string;
      op: 'eq' | 'neq' | 'in' | 'nin' | 'gt' | 'gte' | 'lt' | 'lte' | 'exists';
      value?: string | number | boolean | string[];
    }
  | { type: 'AND' | 'OR'; conditions: Condition[] }
  | { type: 'NOT'; condition: Condition };

export const conditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    z.object({ type: z.literal('ALWAYS') }),
    z.object({ type: z.literal('LINE_CATEGORY_REQUIRES_ROLE') }),
    z.object({ type: z.literal('LINE_CATEGORY_IN'), categoryCodes: z.array(z.string()) }),
    z.object({
      type: z.literal('TOTAL_AMOUNT'),
      op: z.enum(['gt', 'gte', 'lt', 'lte', 'eq']),
      value: z.string().regex(/^-?\d+(\.\d+)?$/, 'decimal string expected'),
    }),
    z.object({
      type: z.literal('FIELD'),
      field: z.string().min(1),
      op: z.enum(['eq', 'neq', 'in', 'nin', 'gt', 'gte', 'lt', 'lte', 'exists']),
      value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]).optional(),
    }),
    z.object({ type: z.enum(['AND', 'OR']), conditions: z.array(conditionSchema) }),
    z.object({ type: z.literal('NOT'), condition: conditionSchema }),
  ]),
);

export interface ConditionFacts {
  stepRoleId: string;
  totalAmount: string;
  lineCategoryCodes: string[];
  requiredRoleIds: string[];
  header: Record<string, unknown>;
  department: { code: string | null };
  module: Record<string, unknown>;
}

export const ALWAYS_CONDITION: Condition = { type: 'ALWAYS' };

// ---------- TemplateConfig (PLAN 3.2) ----------
export const lineColumnKeySchema = z.union([
  z.enum(['category', 'originalAmount', 'amount', 'quantity', 'unitPrice', 'note']),
  z.string().regex(/^extra\..+/),
]);

export const templateConfigSchema = z.object({
  logoKey: z.string().optional(),
  titleAr: z.string(),
  titleEn: z.string().optional(),
  companyNameAr: z.string().optional(),
  headerFields: z.array(
    z.object({ key: z.string(), labelAr: z.string(), labelEn: z.string().optional(), show: z.boolean() }),
  ),
  lineColumns: z.array(z.object({ key: lineColumnKeySchema, labelAr: z.string(), show: z.boolean() })),
  categoryOrder: z.array(z.string()).optional(),
  showOriginalValues: z.boolean(),
  showAmountInWords: z.boolean(),
  footerNoteAr: z.string().optional(),
  signature: z.object({
    perRow: z.number().int().min(1).max(8),
    showDateTime: z.boolean(),
    submitterLabelAr: z.string(),
  }),
});
export type TemplateConfig = z.infer<typeof templateConfigSchema>;

// ---------- Bot (PLAN 6) ----------
export const draftLineSchema = z.object({
  categoryId: z.string(),
  categoryCode: z.string(),
  categoryName: z.string(),
  amount: z.string(),
  extraValues: z.record(z.string()),
  attachmentIds: z.array(z.string()),
});
export type DraftLine = z.infer<typeof draftLineSchema>;

export const botDraftSchema = z.object({
  requestTypeCode: z.string(),
  startedAt: z.string(),
  vehicleId: z.string(),
  vehicleNumber: z.string(),
  costCenterCode: z.string(),
  odometer: z.number().int().optional(),
  odometerWarning: z.string().optional(),
  lines: z.array(draftLineSchema),
  current: draftLineSchema
    .partial()
    .extend({ extraIndex: z.number().int().optional() })
    .optional(),
  editingIndex: z.number().int().optional(),
});
export type BotDraft = z.infer<typeof botDraftSchema>;

export const correctionCtxSchema = z.object({
  requestId: z.string(),
  correctionRequestId: z.string(),
  newAttachmentIds: z.array(z.string()),
  newAmount: z.string().optional(),
});
export type CorrectionCtx = z.infer<typeof correctionCtxSchema>;
