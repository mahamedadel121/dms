import { describe, expect, it } from 'vitest';
import { groupStages } from './helpers';
import { currentPosition, isStageDone } from './routeModel';
import type { StepDto, StepStatus } from '../types';

let n = 0;
function step(stageIndex: number, status: StepStatus): StepDto {
  n += 1;
  return { id: `s${n}`, stepKey: `k${n}`, stageIndex, status } as unknown as StepDto;
}

describe('routeModel', () => {
  it('counts stages excluding fully skipped ones', () => {
    const stages = groupStages([step(0, 'APPROVED'), step(1, 'NOT_APPLICABLE'), step(2, 'ACTIVE'), step(3, 'PENDING')]);
    expect(currentPosition(stages)).toEqual({ i: 2, n: 3 });
  });

  it('position of a parallel stage', () => {
    const stages = groupStages([step(0, 'APPROVED'), step(1, 'APPROVED'), step(1, 'ACTIVE'), step(2, 'PENDING')]);
    expect(currentPosition(stages)).toEqual({ i: 2, n: 3 });
  });

  it('null when nothing is active', () => {
    const stages = groupStages([step(0, 'APPROVED'), step(1, 'APPROVED')]);
    expect(currentPosition(stages)).toBeNull();
    expect(currentPosition([])).toBeNull();
  });

  it('a stage is done when all applicable steps are approved', () => {
    expect(isStageDone({ steps: [step(0, 'APPROVED'), step(0, 'NOT_APPLICABLE')] })).toBe(true);
    expect(isStageDone({ steps: [step(0, 'APPROVED'), step(0, 'ACTIVE')] })).toBe(false);
    expect(isStageDone({ steps: [step(0, 'PENDING')] })).toBe(false);
  });
});
