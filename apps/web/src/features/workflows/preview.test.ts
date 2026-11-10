import { describe, expect, it } from 'vitest';
import { blankStep, type EditableStep } from './stepModel';
import { countApplicable, extractApplicable, previewSteps } from './preview';

const mk = (key: string, over: Partial<EditableStep> = {}): EditableStep => ({ ...blankStep([]), key, nameAr: key, nameEn: key, roleId: 'r1', ...over });

describe('previewSteps', () => {
  it('builds pending steps in order', () => {
    const out = previewSteps([mk('a'), mk('b'), mk('c')]);
    expect(out.map((s) => s.stepKey)).toEqual(['a', 'b', 'c']);
    expect(out.map((s) => s.stageIndex)).toEqual([0, 1, 2]);
    expect(out.every((s) => s.status === 'PENDING')).toBe(true);
  });
  it('parallel groups share a stage', () => {
    const out = previewSteps([mk('a'), mk('b', { parallelGroup: 'g' }), mk('c', { parallelGroup: 'g' }), mk('d')]);
    expect(out.map((s) => s.stageIndex)).toEqual([0, 1, 1, 2]);
  });
  it('simulation marks non-applicable steps', () => {
    const sim = extractApplicable({ steps: [{ key: 'a', applicable: true }, { key: 'b', applicable: false }, { key: 'dyn:x', applicable: false }, { key: 'dyn:y', applicable: true }] });
    const steps = [mk('a'), mk('b'), mk('dyn'), mk('c')];
    const out = previewSteps(steps, sim);
    expect(out.map((s) => s.status)).toEqual(['PENDING', 'NOT_APPLICABLE', 'PENDING', 'PENDING']);
    expect(countApplicable(steps, sim)).toBe(3);
  });
});
