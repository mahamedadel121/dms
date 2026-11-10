import { describe, expect, it } from 'vitest';
import type { Condition } from '@dms/shared';
import ar from '../../i18n/ar/workflows';
import { describeCondition, type DescribeT } from './describe';

const t: DescribeT = (key, params) => {
  const raw = ar[key.replace(/^workflows\./, '')] ?? key;
  return raw.replace(/\{(\w+)\}/g, (_, k: string) => String(params?.[k] ?? ''));
};
const total = (op: 'gt' | 'lte', value: string): Condition => ({ type: 'TOTAL_AMOUNT', op, value });
const cats = (...categoryCodes: string[]): Condition => ({ type: 'LINE_CATEGORY_IN', categoryCodes });

describe('describeCondition', () => {
  it('ALWAYS is empty', () => {
    expect(describeCondition({ type: 'ALWAYS' }, t)).toBe('');
  });
  it('total amount comparison', () => {
    expect(describeCondition(total('gt', '5000'), t, { money: (v) => `${v} ج.م` })).toBe('إذا كان الإجمالي أكبر من 5000 ج.م');
    expect(describeCondition(total('lte', '100'), t)).toContain('أصغر من أو يساوي');
  });
  it('category list uses names', () => {
    const s = describeCondition(cats('maint', 'parts', 'unknown'), t, { categoryNames: { maint: 'صيانة', parts: 'قطع غيار' } });
    expect(s).toContain('(صيانة، قطع غيار، unknown)');
  });
  it('AND joins with و', () => {
    const s = describeCondition({ type: 'AND', conditions: [total('gt', '10'), cats('a')] }, t);
    expect(s).toContain(' و ');
    expect(s).not.toContain(' أو ');
  });
  it('OR and nested groups use parentheses', () => {
    const s = describeCondition({ type: 'OR', conditions: [total('gt', '10'), { type: 'AND', conditions: [cats('a'), cats('b')] }] }, t);
    expect(s).toContain(' أو ');
    expect(s).toMatch(/\(.* و .*\)/);
  });
  it('NOT', () => {
    expect(describeCondition({ type: 'NOT', condition: cats('a') }, t)).toContain('ليس');
  });
});
