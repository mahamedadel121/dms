import { describe, expect, it } from 'vitest';
import type { Condition, ConditionFacts } from '@dms/shared';
import { evaluateCondition } from './conditions';

const facts: ConditionFacts = {
  stepRoleId: 'r1',
  totalAmount: '1500.50',
  lineCategoryCodes: ['TOLLS', 'DIESEL'],
  requiredRoleIds: ['r1', 'r9'],
  header: { odometer: 120000, note: 'abc', flag: false },
  department: { code: 'VEH' },
  module: { vehicleTypeCode: 'TRUCK', costCenterCode: 'MLF450', vehicleNumber: '2157' },
};
const ev = (c: Condition) => evaluateCondition(c, facts);

describe('evaluateCondition', () => {
  it.each<[string, Condition, boolean]>([
    ['ALWAYS', { type: 'ALWAYS' }, true],
    ['requires role yes', { type: 'LINE_CATEGORY_REQUIRES_ROLE' }, true],
    ['category in yes', { type: 'LINE_CATEGORY_IN', categoryCodes: ['MAINTENANCE', 'DIESEL'] }, true],
    ['category in no', { type: 'LINE_CATEGORY_IN', categoryCodes: ['TIPS'] }, false],
    ['total gt', { type: 'TOTAL_AMOUNT', op: 'gt', value: '1500.49' }, true],
    ['total gte eq', { type: 'TOTAL_AMOUNT', op: 'gte', value: '1500.50' }, true],
    ['total lt', { type: 'TOTAL_AMOUNT', op: 'lt', value: '1500.50' }, false],
    ['total lte', { type: 'TOTAL_AMOUNT', op: 'lte', value: '1500.50' }, true],
    ['total eq', { type: 'TOTAL_AMOUNT', op: 'eq', value: '1500.5' }, true],
    ['field eq module', { type: 'FIELD', field: 'module.vehicleTypeCode', op: 'eq', value: 'TRUCK' }, true],
    ['field neq', { type: 'FIELD', field: 'module.vehicleTypeCode', op: 'neq', value: 'TRUCK' }, false],
    ['field in', { type: 'FIELD', field: 'module.costCenterCode', op: 'in', value: ['A', 'MLF450'] }, true],
    ['field nin', { type: 'FIELD', field: 'module.costCenterCode', op: 'nin', value: ['A', 'MLF450'] }, false],
    ['field gt numeric', { type: 'FIELD', field: 'header.odometer', op: 'gt', value: 100000 }, true],
    ['field lte numeric string', { type: 'FIELD', field: 'header.odometer', op: 'lte', value: '120000' }, true],
    ['field exists yes', { type: 'FIELD', field: 'header.note', op: 'exists' }, true],
    ['field exists no', { type: 'FIELD', field: 'header.missing', op: 'exists' }, false],
    ['missing path -> false', { type: 'FIELD', field: 'header.missing', op: 'eq', value: 'x' }, false],
    ['missing path neq -> false', { type: 'FIELD', field: 'header.missing', op: 'neq', value: 'x' }, false],
    ['department', { type: 'FIELD', field: 'department.code', op: 'eq', value: 'VEH' }, true],
    ['bool eq', { type: 'FIELD', field: 'header.flag', op: 'eq', value: false }, true],
    ['AND', { type: 'AND', conditions: [{ type: 'ALWAYS' }, { type: 'TOTAL_AMOUNT', op: 'gt', value: '1' }] }, true],
    ['AND false', { type: 'AND', conditions: [{ type: 'ALWAYS' }, { type: 'TOTAL_AMOUNT', op: 'gt', value: '9999' }] }, false],
    ['OR', { type: 'OR', conditions: [{ type: 'TOTAL_AMOUNT', op: 'gt', value: '9999' }, { type: 'ALWAYS' }] }, true],
    ['NOT', { type: 'NOT', condition: { type: 'LINE_CATEGORY_IN', categoryCodes: ['TIPS'] } }, true],
    ['empty AND', { type: 'AND', conditions: [] }, true],
    ['empty OR', { type: 'OR', conditions: [] }, false],
  ])('%s', (_n, c, expected) => {
    expect(ev(c)).toBe(expected);
  });

  it('requires-role is false when the step role is not required', () => {
    expect(evaluateCondition({ type: 'LINE_CATEGORY_REQUIRES_ROLE' }, { ...facts, stepRoleId: 'other' })).toBe(false);
  });
});
