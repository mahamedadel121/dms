import { conditionSchema, type Condition } from '@dms/shared';

/** Editable (string based) model used by the rule builder UI. Lossless against `Condition`. */
export type ValueType = 'string' | 'number' | 'boolean';
export type TotalOp = 'gt' | 'gte' | 'lt' | 'lte' | 'eq';
export type FieldOp = 'eq' | 'neq' | 'in' | 'nin' | 'gt' | 'gte' | 'lt' | 'lte' | 'exists';

export type CNode =
  | { kind: 'ALWAYS' }
  | { kind: 'LINE_CATEGORY_REQUIRES_ROLE' }
  | { kind: 'LINE_CATEGORY_IN'; codes: string }
  | { kind: 'TOTAL_AMOUNT'; op: TotalOp; value: string }
  | { kind: 'FIELD'; field: string; op: FieldOp; value: string; valueType: ValueType }
  | { kind: 'AND' | 'OR'; children: CNode[] }
  | { kind: 'NOT'; child: CNode };

export const NODE_KINDS: CNode['kind'][] = [
  'ALWAYS',
  'LINE_CATEGORY_REQUIRES_ROLE',
  'LINE_CATEGORY_IN',
  'TOTAL_AMOUNT',
  'FIELD',
  'AND',
  'OR',
  'NOT',
];
export const TOTAL_OPS: TotalOp[] = ['gt', 'gte', 'lt', 'lte', 'eq'];
export const FIELD_OPS: FieldOp[] = ['eq', 'neq', 'in', 'nin', 'gt', 'gte', 'lt', 'lte', 'exists'];
export const FIELD_PATHS = [
  'header.odometer',
  'department.code',
  'module.vehicleTypeCode',
  'module.costCenterCode',
  'module.vehicleStatus',
  'module.vehicleNumber',
];

export function newNode(kind: CNode['kind']): CNode {
  switch (kind) {
    case 'ALWAYS':
    case 'LINE_CATEGORY_REQUIRES_ROLE':
      return { kind };
    case 'LINE_CATEGORY_IN':
      return { kind, codes: '' };
    case 'TOTAL_AMOUNT':
      return { kind, op: 'gt', value: '0' };
    case 'FIELD':
      return { kind, field: 'module.vehicleTypeCode', op: 'eq', value: '', valueType: 'string' };
    case 'AND':
    case 'OR':
      return { kind, children: [{ kind: 'ALWAYS' }] };
    case 'NOT':
      return { kind, child: { kind: 'ALWAYS' } };
  }
}

const splitList = (s: string): string[] =>
  s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

export function toCondition(n: CNode): Condition {
  switch (n.kind) {
    case 'ALWAYS':
    case 'LINE_CATEGORY_REQUIRES_ROLE':
      return { type: n.kind };
    case 'LINE_CATEGORY_IN':
      return { type: 'LINE_CATEGORY_IN', categoryCodes: splitList(n.codes) };
    case 'TOTAL_AMOUNT':
      return { type: 'TOTAL_AMOUNT', op: n.op, value: n.value.trim() };
    case 'FIELD': {
      const field = n.field.trim();
      if (n.op === 'exists') return { type: 'FIELD', field, op: 'exists' };
      if (n.op === 'in' || n.op === 'nin') return { type: 'FIELD', field, op: n.op, value: splitList(n.value) };
      let value: string | number | boolean = n.value;
      if (n.valueType === 'number') value = Number(n.value);
      else if (n.valueType === 'boolean') value = n.value.trim() === 'true';
      return { type: 'FIELD', field, op: n.op, value };
    }
    case 'AND':
    case 'OR':
      return { type: n.kind, conditions: n.children.map(toCondition) };
    case 'NOT':
      return { type: 'NOT', condition: toCondition(n.child) };
  }
}

export function fromCondition(c: Condition): CNode {
  switch (c.type) {
    case 'ALWAYS':
    case 'LINE_CATEGORY_REQUIRES_ROLE':
      return { kind: c.type };
    case 'LINE_CATEGORY_IN':
      return { kind: 'LINE_CATEGORY_IN', codes: c.categoryCodes.join(', ') };
    case 'TOTAL_AMOUNT':
      return { kind: 'TOTAL_AMOUNT', op: c.op, value: c.value };
    case 'FIELD': {
      const v = c.value;
      if (Array.isArray(v)) return { kind: 'FIELD', field: c.field, op: c.op, value: v.join(', '), valueType: 'string' };
      if (typeof v === 'number') return { kind: 'FIELD', field: c.field, op: c.op, value: String(v), valueType: 'number' };
      if (typeof v === 'boolean') return { kind: 'FIELD', field: c.field, op: c.op, value: String(v), valueType: 'boolean' };
      return { kind: 'FIELD', field: c.field, op: c.op, value: v ?? '', valueType: 'string' };
    }
    case 'AND':
    case 'OR':
      return { kind: c.type, children: c.conditions.map(fromCondition) };
    case 'NOT':
      return { kind: 'NOT', child: fromCondition(c.condition) };
  }
}

/** Parse Condition JSON text. Returns the condition or an error message. */
export function parseConditionJson(text: string): { ok: true; condition: Condition } | { ok: false; error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Invalid JSON' };
  }
  const r = conditionSchema.safeParse(raw);
  if (!r.success) {
    return { ok: false, error: r.error.issues.map((i) => `${i.path.join('.') || '$'}: ${i.message}`).slice(0, 3).join('; ') };
  }
  return { ok: true, condition: r.data };
}

export const conditionToJson = (c: Condition): string => JSON.stringify(c, null, 2);

/** Light validation for the builder tree (before sending). */
export function validateNode(n: CNode): string | null {
  const r = conditionSchema.safeParse(toCondition(n));
  if (r.success) return null;
  return r.error.issues[0]?.message ?? 'invalid';
}
