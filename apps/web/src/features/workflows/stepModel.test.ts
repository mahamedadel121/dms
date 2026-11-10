import { describe, expect, it } from 'vitest';
import { blankStep, moveStep, toInput, validateSteps, type EditableStep } from './stepModel';

const mk = (over: Partial<EditableStep>): EditableStep => ({ ...blankStep([]), nameAr: 'أ', nameEn: 'A', roleId: 'r1', ...over });

describe('stepModel', () => {
  it('moveStep reorders and ignores out of range', () => {
    expect(moveStep([1, 2, 3], 0, 2)).toEqual([2, 3, 1]);
    expect(moveStep([1, 2, 3], 2, 0)).toEqual([3, 1, 2]);
    expect(moveStep([1, 2, 3], 0, 5)).toEqual([1, 2, 3]);
  });
  it('valid workflow passes', () => {
    const steps = [mk({ key: 'a' }), mk({ key: 'b', parallelGroup: 'x' }), mk({ key: 'c', parallelGroup: 'x' }), mk({ key: 'pay', kind: 'PAYMENT' })];
    expect(validateSteps(steps)).toEqual([]);
  });
  it('detects duplicate keys, missing role, non-contiguous group, payment rules', () => {
    const codes = (s: EditableStep[]) => validateSteps(s).map((i) => i.code);
    expect(codes([])).toEqual(['NO_STEPS']);
    expect(codes([mk({ key: 'a' }), mk({ key: 'a' })])).toContain('DUP_KEY');
    expect(codes([mk({ key: 'a', roleId: '' })])).toContain('NO_ROLE');
    expect(codes([mk({ key: 'a', parallelGroup: 'g' }), mk({ key: 'b' }), mk({ key: 'c', parallelGroup: 'g' })])).toContain('GROUP_NOT_CONTIGUOUS');
    expect(codes([mk({ key: 'p', kind: 'PAYMENT' }), mk({ key: 'b' })])).toContain('PAYMENT_NOT_LAST');
    expect(codes([mk({ key: 'p', kind: 'PAYMENT' }), mk({ key: 'q', kind: 'PAYMENT' })])).toContain('MANY_PAYMENT');
    expect(codes([mk({ key: 'p', kind: 'PAYMENT', parallelGroup: 'g' })])).toContain('PAYMENT_IN_GROUP');
    expect(codes([mk({ key: 'Bad Key' })])).toContain('BAD_KEY');
  });
  it('toInput normalises empty values to null', () => {
    const i = toInput(mk({ key: 'a', parallelGroup: ' ', slaHours: '', stepType: 'DYNAMIC_CATEGORY_ROLES', roleId: 'r1' }));
    expect(i.parallelGroup).toBeNull();
    expect(i.slaHours).toBeNull();
    expect(i.roleId).toBeNull();
    expect(toInput(mk({ slaHours: '24' })).slaHours).toBe(24);
  });
});
