import { describe, expect, it } from 'vitest';
import type { Condition } from '@dms/shared';
import { conditionToJson, fromCondition, newNode, parseConditionJson, toCondition, validateNode } from './condition';

const samples: Condition[] = [
  { type: 'ALWAYS' },
  { type: 'LINE_CATEGORY_REQUIRES_ROLE' },
  { type: 'LINE_CATEGORY_IN', categoryCodes: ['MAINT', 'SPARE'] },
  { type: 'TOTAL_AMOUNT', op: 'gte', value: '5000.00' },
  { type: 'FIELD', field: 'module.vehicleTypeCode', op: 'eq', value: 'TRUCK' },
  { type: 'FIELD', field: 'header.odometer', op: 'gt', value: 1000 },
  { type: 'FIELD', field: 'module.flag', op: 'eq', value: true },
  { type: 'FIELD', field: 'department.code', op: 'in', value: ['A', 'B'] },
  { type: 'FIELD', field: 'module.x', op: 'exists' },
  {
    type: 'AND',
    conditions: [
      { type: 'TOTAL_AMOUNT', op: 'gt', value: '100' },
      {
        type: 'NOT',
        condition: { type: 'OR', conditions: [{ type: 'ALWAYS' }, { type: 'LINE_CATEGORY_IN', categoryCodes: ['TOLL'] }] },
      },
    ],
  },
];

describe('condition builder round trip', () => {
  it.each(samples.map((s, i) => [i, s] as const))('sample %i: Condition -> builder -> Condition', (_i, c) => {
    expect(toCondition(fromCondition(c))).toEqual(c);
  });
  it('JSON text -> condition -> builder -> JSON text is stable', () => {
    for (const c of samples) {
      const text = conditionToJson(c);
      const p = parseConditionJson(text);
      expect(p.ok).toBe(true);
      if (p.ok) expect(conditionToJson(toCondition(fromCondition(p.condition)))).toBe(text);
    }
  });
  it('rejects invalid JSON and invalid shapes', () => {
    expect(parseConditionJson('{').ok).toBe(false);
    expect(parseConditionJson('{"type":"NOPE"}').ok).toBe(false);
    expect(parseConditionJson('{"type":"TOTAL_AMOUNT","op":"gt","value":"abc"}').ok).toBe(false);
  });
  it('new nodes are valid and bad amounts are flagged', () => {
    expect(validateNode(newNode('ALWAYS'))).toBeNull();
    expect(validateNode(newNode('AND'))).toBeNull();
    expect(validateNode(newNode('NOT'))).toBeNull();
    expect(validateNode({ kind: 'TOTAL_AMOUNT', op: 'gt', value: 'x' })).not.toBeNull();
  });
});
