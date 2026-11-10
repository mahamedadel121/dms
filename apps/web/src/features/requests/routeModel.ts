import type { Stage } from './helpers';

/** A stage is done when every applicable step is approved. A fully skipped stage counts as done (nothing left to do). */
export function isStageDone(stage: Pick<Stage, 'steps'>): boolean {
  const applicable = stage.steps.filter((s) => s.status !== 'NOT_APPLICABLE');
  return applicable.every((s) => s.status === 'APPROVED');
}

/**
 * 1-based position of the current stage among the stages that actually apply (fully skipped stages are not counted).
 * The current stage is the first one holding an ACTIVE or AWAITING_CORRECTION step. Null when there is none.
 */
export function currentPosition(stages: Pick<Stage, 'steps' | 'skipped'>[]): { i: number; n: number } | null {
  const live = stages.filter((s) => !s.skipped);
  const idx = live.findIndex((s) => s.steps.some((st) => st.status === 'ACTIVE' || st.status === 'AWAITING_CORRECTION'));
  if (idx < 0) return null;
  return { i: idx + 1, n: live.length };
}
