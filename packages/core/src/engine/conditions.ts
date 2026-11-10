import { conditionSchema, dec, type Condition, type ConditionFacts } from '@dms/shared';

function getPath(obj: unknown, path: string): { found: boolean; value: unknown } {
  let cur: unknown = obj;
  for (const part of path.split('.')) {
    if (cur === null || typeof cur !== 'object' || !(part in (cur as Record<string, unknown>))) {
      return { found: false, value: undefined };
    }
    cur = (cur as Record<string, unknown>)[part];
  }
  return { found: cur !== undefined && cur !== null, value: cur };
}

function compareNum(a: unknown, b: unknown): number | null {
  try {
    const da = dec(a as string | number);
    const db = dec(b as string | number);
    if (da.isNaN() || db.isNaN()) return null;
    return da.comparedTo(db);
  } catch {
    return null;
  }
}

function scalarEq(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === undefined || a === null || b === undefined || b === null) return false;
  const c = compareNum(a, b);
  if (c !== null && typeof a !== 'boolean' && typeof b !== 'boolean') return c === 0;
  return String(a) === String(b);
}

/** Pure condition evaluator (PLAN 5.2). Missing FIELD path -> false (except `exists`). */
export function evaluateCondition(c: Condition, facts: ConditionFacts): boolean {
  switch (c.type) {
    case 'ALWAYS':
      return true;
    case 'LINE_CATEGORY_REQUIRES_ROLE':
      return facts.requiredRoleIds.includes(facts.stepRoleId);
    case 'LINE_CATEGORY_IN':
      return c.categoryCodes.some((code) => facts.lineCategoryCodes.includes(code));
    case 'TOTAL_AMOUNT': {
      const cmp = dec(facts.totalAmount).comparedTo(dec(c.value));
      switch (c.op) {
        case 'gt':
          return cmp > 0;
        case 'gte':
          return cmp >= 0;
        case 'lt':
          return cmp < 0;
        case 'lte':
          return cmp <= 0;
        case 'eq':
          return cmp === 0;
      }
      return false;
    }
    case 'FIELD': {
      const { found, value } = getPath(facts, c.field);
      if (c.op === 'exists') return found;
      if (!found) return false;
      const rhs = c.value;
      switch (c.op) {
        case 'eq':
          return scalarEq(value, rhs);
        case 'neq':
          return !scalarEq(value, rhs);
        case 'in':
          return Array.isArray(rhs) && rhs.some((r) => scalarEq(value, r));
        case 'nin':
          return Array.isArray(rhs) && !rhs.some((r) => scalarEq(value, r));
        case 'gt':
        case 'gte':
        case 'lt':
        case 'lte': {
          const cmp = compareNum(value, rhs);
          if (cmp === null) return false;
          return c.op === 'gt' ? cmp > 0 : c.op === 'gte' ? cmp >= 0 : c.op === 'lt' ? cmp < 0 : cmp <= 0;
        }
      }
      return false;
    }
    case 'AND':
      return c.conditions.every((x) => evaluateCondition(x, facts));
    case 'OR':
      return c.conditions.some((x) => evaluateCondition(x, facts));
    case 'NOT':
      return !evaluateCondition(c.condition, facts);
  }
  return false;
}

/** Parses stored condition JSON; throws a ZodError when invalid. */
export function parseCondition(raw: unknown): Condition {
  return conditionSchema.parse(raw);
}

export function conditionUses(c: Condition, type: Condition['type']): boolean {
  if (c.type === type) return true;
  if (c.type === 'AND' || c.type === 'OR') return c.conditions.some((x) => conditionUses(x, type));
  if (c.type === 'NOT') return conditionUses(c.condition, type);
  return false;
}
