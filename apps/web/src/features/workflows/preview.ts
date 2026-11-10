import type { RequestStepDto } from '@dms/shared';
import type { EditableStep } from './stepModel';

/** key (or `key:categoryCode` for dynamic steps) -> applies, as read from the simulate response. */
export type SimulationResult = Map<string, boolean>;

/** Best-effort reading of the simulate response: an array / `steps` of { key|stepKey, applicable|applies|active|status }. */
export function extractApplicable(r: unknown): SimulationResult | null {
  const list = Array.isArray(r) ? r : Array.isArray((r as { steps?: unknown })?.steps) ? (r as { steps: unknown[] }).steps : null;
  if (!list) return null;
  const m: SimulationResult = new Map();
  for (const it of list) {
    const o = it as Record<string, unknown>;
    const key = (o.key ?? o.stepKey) as string | undefined;
    if (!key) continue;
    const a = o.applicable ?? o.applies ?? o.active;
    if (typeof a === 'boolean') m.set(key, a);
    else if (typeof o.status === 'string') m.set(key, o.status !== 'NOT_APPLICABLE');
  }
  return m.size > 0 ? m : null;
}

function stepApplies(key: string, sim: SimulationResult): boolean | null {
  const hits = [...sim.entries()].filter(([k]) => k === key || k.startsWith(`${key}:`));
  if (hits.length === 0) return null;
  return hits.some(([, v]) => v);
}

/** Number of top-level steps that apply in a simulation (a dynamic step applies when any of its entries does). */
export function countApplicable(steps: EditableStep[], sim: SimulationResult | null | undefined): number {
  if (!sim) return steps.length;
  return steps.filter((s) => stepApplies(s.key, sim) !== false).length;
}

/**
 * Synthetic request steps for the edited route. Every step is PENDING; after a simulation the steps that
 * do not apply become NOT_APPLICABLE. Consecutive steps of one parallel group share a stage.
 */
export function previewSteps(steps: EditableStep[], sim?: SimulationResult | null, roleName?: (roleId: string) => string, locale: 'ar' | 'en' = 'ar'): RequestStepDto[] {
  let stage = -1;
  let prevGroup = '';
  return steps.map((s) => {
    const group = s.parallelGroup.trim();
    if (!(group && group === prevGroup)) stage += 1;
    prevGroup = group;
    const applies = sim ? stepApplies(s.key, sim) : null;
    const role = s.roleId && roleName ? roleName(s.roleId) : '';
    return {
      id: s.uid,
      stepKey: s.key,
      stageIndex: stage,
      nameAr: s.nameAr || s.key,
      nameEn: s.nameEn || s.nameAr || s.key,
      roleId: s.roleId,
      roleNameAr: locale === 'ar' ? role : '',
      roleNameEn: locale === 'en' ? role : '',
      kind: s.kind,
      status: applies === false ? 'NOT_APPLICABLE' : 'PENDING',
      activatedAt: null,
      dueAt: null,
      actedAt: null,
      actedByName: null,
      onBehalfOfName: null,
      comment: null,
      signatureUrl: null,
      returnedAt: null,
      correctionRequestedByName: null,
      showInSignatures: s.showInSignatures,
    };
  });
}
