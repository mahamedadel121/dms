import type { ChecklistItem, Condition } from '@dms/shared';
import type { StepInput, WorkflowStepDto } from '../types';

export type ActionCode = 'APPROVE' | 'REQUEST_CORRECTION' | 'SEND_BACK' | 'REJECT';
export const ALL_ACTIONS: ActionCode[] = ['APPROVE', 'REQUEST_CORRECTION', 'SEND_BACK', 'REJECT'];

/** Editable step (strings for inputs, stable `uid` for list keys / drag and drop). */
export interface EditableStep {
  uid: string;
  key: string;
  stepType: 'ROLE' | 'DYNAMIC_CATEGORY_ROLES';
  kind: 'APPROVAL' | 'PAYMENT';
  nameAr: string;
  nameEn: string;
  roleId: string;
  parallelGroup: string;
  condition: Condition;
  allowedActions: ActionCode[];
  canEditAmounts: boolean;
  canReclassify: boolean;
  checklist: ChecklistItem[];
  slaHours: string;
  showInSignatures: boolean;
}

let seq = 0;
export const newUid = () => `s${Date.now().toString(36)}${(seq++).toString(36)}`;

export function blankStep(existingKeys: string[]): EditableStep {
  let n = existingKeys.length + 1;
  let key = `step_${n}`;
  while (existingKeys.includes(key)) key = `step_${++n}`;
  return {
    uid: newUid(),
    key,
    stepType: 'ROLE',
    kind: 'APPROVAL',
    nameAr: '',
    nameEn: '',
    roleId: '',
    parallelGroup: '',
    condition: { type: 'ALWAYS' },
    allowedActions: [...ALL_ACTIONS],
    canEditAmounts: false,
    canReclassify: false,
    checklist: [],
    slaHours: '',
    showInSignatures: true,
  };
}

export function fromDto(s: WorkflowStepDto): EditableStep {
  return {
    uid: s.id || newUid(),
    key: s.key,
    stepType: s.stepType ?? 'ROLE',
    kind: s.kind ?? 'APPROVAL',
    nameAr: s.nameAr,
    nameEn: s.nameEn,
    roleId: s.roleId ?? '',
    parallelGroup: s.parallelGroup ?? '',
    condition: s.condition ?? { type: 'ALWAYS' },
    allowedActions: (s.allowedActions ?? ALL_ACTIONS) as ActionCode[],
    canEditAmounts: !!s.canEditAmounts,
    canReclassify: !!s.canReclassify,
    checklist: s.checklist ?? [],
    slaHours: s.slaHours ? String(s.slaHours) : '',
    showInSignatures: s.showInSignatures !== false,
  };
}

export function toInput(s: EditableStep): StepInput {
  const sla = parseInt(s.slaHours, 10);
  return {
    key: s.key.trim(),
    stepType: s.stepType,
    kind: s.kind,
    nameAr: s.nameAr.trim(),
    nameEn: s.nameEn.trim(),
    roleId: s.stepType === 'ROLE' && s.roleId ? s.roleId : null,
    parallelGroup: s.parallelGroup.trim() || null,
    condition: s.condition,
    allowedActions: s.allowedActions,
    canEditAmounts: s.canEditAmounts,
    canReclassify: s.canReclassify,
    checklist: s.checklist,
    slaHours: Number.isFinite(sla) && sla > 0 ? sla : null,
    showInSignatures: s.showInSignatures,
  };
}

export function moveStep<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = [...list];
  const [it] = next.splice(from, 1);
  next.splice(to, 0, it!);
  return next;
}

export type StepIssue =
  | { code: 'NO_STEPS' }
  | { code: 'DUP_KEY'; index: number }
  | { code: 'BAD_KEY'; index: number }
  | { code: 'NO_NAME'; index: number }
  | { code: 'NO_ROLE'; index: number }
  | { code: 'GROUP_NOT_CONTIGUOUS'; index: number }
  | { code: 'PAYMENT_NOT_LAST'; index: number }
  | { code: 'MANY_PAYMENT'; index: number }
  | { code: 'PAYMENT_IN_GROUP'; index: number };

/** Mirrors the publish validation of PLAN 5.1 so errors show before the server round trip. */
export function validateSteps(steps: EditableStep[]): StepIssue[] {
  const out: StepIssue[] = [];
  if (steps.length === 0) return [{ code: 'NO_STEPS' }];
  const seen = new Set<string>();
  const closedGroups = new Set<string>();
  let prevGroup = '';
  let payments = 0;
  steps.forEach((s, i) => {
    const key = s.key.trim();
    if (!/^[a-z0-9_]+$/.test(key)) out.push({ code: 'BAD_KEY', index: i });
    else if (seen.has(key)) out.push({ code: 'DUP_KEY', index: i });
    seen.add(key);
    if (!s.nameAr.trim() || !s.nameEn.trim()) out.push({ code: 'NO_NAME', index: i });
    if (s.stepType === 'ROLE' && !s.roleId) out.push({ code: 'NO_ROLE', index: i });
    const g = s.parallelGroup.trim();
    if (g !== prevGroup) {
      if (prevGroup) closedGroups.add(prevGroup);
      if (g && closedGroups.has(g)) out.push({ code: 'GROUP_NOT_CONTIGUOUS', index: i });
    }
    prevGroup = g;
    if (s.kind === 'PAYMENT') {
      payments++;
      if (payments > 1) out.push({ code: 'MANY_PAYMENT', index: i });
      if (i !== steps.length - 1) out.push({ code: 'PAYMENT_NOT_LAST', index: i });
      if (g) out.push({ code: 'PAYMENT_IN_GROUP', index: i });
    }
  });
  return out;
}
