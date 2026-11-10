import type { Condition } from '@dms/shared';

type Params = Record<string, string | number>;
export type DescribeT = (key: string, params?: Params) => string;

export interface DescribeContext {
  /** category code -> display name; unknown codes are shown as-is */
  categoryNames?: Record<string, string>;
  /** field path -> display label */
  fieldLabels?: Record<string, string>;
  /** money formatter for TOTAL_AMOUNT values */
  money?: (v: string) => string;
}

const isGroup = (c: Condition) => c.type === 'AND' || c.type === 'OR';

function valueText(v: unknown): string {
  if (Array.isArray(v)) return v.map(String).join(', ');
  if (v === undefined || v === null) return '';
  return String(v);
}

function clause(c: Condition, t: DescribeT, ctx: DescribeContext): string {
  switch (c.type) {
    case 'ALWAYS':
      return t('workflows.describe.always');
    case 'LINE_CATEGORY_REQUIRES_ROLE':
      return t('workflows.describe.requiresRole');
    case 'LINE_CATEGORY_IN': {
      const names = c.categoryCodes.map((code) => ctx.categoryNames?.[code] ?? code).join(t('workflows.describe.sep'));
      return t('workflows.describe.categoryIn', { names });
    }
    case 'TOTAL_AMOUNT':
      return t('workflows.describe.total', { op: t(`workflows.cond.op.${c.op}`), value: ctx.money ? ctx.money(c.value) : c.value });
    case 'FIELD': {
      const field = ctx.fieldLabels?.[c.field] ?? c.field;
      if (c.op === 'exists') return t('workflows.describe.exists', { field });
      return t('workflows.describe.field', { field, op: t(`workflows.cond.op.${c.op}`), value: valueText(c.value) });
    }
    case 'AND':
    case 'OR': {
      const parts = c.conditions.map((x) => {
        const s = clause(x, t, ctx);
        return isGroup(x) ? `(${s})` : s;
      });
      return parts.join(t(c.type === 'AND' ? 'workflows.describe.and' : 'workflows.describe.or'));
    }
    case 'NOT':
      return t('workflows.describe.not', { c: clause(c.condition, t, ctx) });
  }
}

/** One-line sentence for a step condition; '' for ALWAYS (the step always applies). */
export function describeCondition(c: Condition, t: DescribeT, ctx: DescribeContext = {}): string {
  if (c.type === 'ALWAYS') return '';
  return t('workflows.describe.if', { c: clause(c, t, ctx) });
}
