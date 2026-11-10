'use client';

import { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, GripVertical, Layers, Plus, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/Display';
import { Button } from '@/components/ui/Button';
import { Checkbox, FormField, Input, Select } from '@/components/ui/Fields';
import { LookupSelect } from '@/components/ui/Inputs2';
import { cn } from '@/lib/cn';
import { useTr } from '../common/useTr';
import { ConditionEditor } from './ConditionBuilder';
import { ALL_ACTIONS, type ActionCode, type EditableStep, type StepIssue } from './stepModel';

export function StepCard({
  step,
  index,
  total,
  issues,
  readOnly,
  groups,
  roleLabel,
  description,
  onChange,
  onMove,
  onRemove,
  onGroupWithPrev,
}: {
  step: EditableStep;
  index: number;
  total: number;
  issues: StepIssue[];
  readOnly: boolean;
  groups: string[];
  roleLabel: string;
  description?: string;
  onChange: (patch: Partial<EditableStep>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  onGroupWithPrev: () => void;
}) {
  const { t, locale } = useTr();
  const [open, setOpen] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: step.uid, disabled: readOnly });
  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    transition,
  };
  const name = (locale === 'ar' ? step.nameAr : step.nameEn) || step.nameAr || step.nameEn || step.key;
  const bad = issues.length > 0;

  const conditional = step.condition.type !== 'ALWAYS';
  return (
    <div
      ref={setNodeRef}
      style={style}
      data-testid="wf-step"
      data-key={step.key}
      className={cn('rounded-lg border bg-surface shadow-card', bad ? 'border-danger' : 'border-hairline', isDragging && 'z-10 opacity-80 shadow-pop')}
    >
      <div className="flex flex-wrap items-center gap-2 p-3">
        <span
          className={cn(
            'num flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
            conditional ? 'border-2 border-dashed border-primary bg-surface text-primary' : 'bg-primary text-on-primary',
          )}
        >
          {index + 1}
        </span>
        {!readOnly && (
          <button type="button" className="cursor-grab touch-none rounded p-1 text-ink-3 hover:bg-surface-2" aria-label={t('workflows.step.drag')} {...attributes} {...listeners}>
            <GripVertical className="h-5 w-5" />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-medium text-ink">{name}</span>
            {step.kind === 'PAYMENT' && <Badge tone="green">{t('workflows.badge.payment')}</Badge>}
            {step.stepType === 'DYNAMIC_CATEGORY_ROLES' && <Badge tone="purple">{t('workflows.badge.dynamic')}</Badge>}
            {step.parallelGroup && (
              <Badge tone="blue" className="gap-1">
                <Layers className="h-3 w-3" aria-hidden />
                {t('workflows.badge.parallel')} {step.parallelGroup}
              </Badge>
            )}
            {conditional && <Badge tone="amber">{t('workflows.badge.conditional')}</Badge>}
          </div>
          <p className="truncate text-xs text-ink-3">{step.stepType === 'ROLE' ? roleLabel || t('workflows.step.noRole') : t('workflows.step.fromExpenseTypes')}</p>
          {description && <p className="mt-0.5 text-13 text-ink-2">{description}</p>}
        </div>
        {!readOnly && (
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" disabled={index === 0} onClick={() => onMove(-1)} aria-label={t('workflows.step.up')} icon={<ArrowUp className="h-4 w-4" />} />
            <Button size="sm" variant="ghost" disabled={index === total - 1} onClick={() => onMove(1)} aria-label={t('workflows.step.down')} icon={<ArrowDown className="h-4 w-4" />} />
            <Button size="sm" variant="ghost" onClick={onRemove} aria-label={t('common.remove')} icon={<Trash2 className="h-4 w-4 text-danger" />} />
          </div>
        )}
        <Button
          size="sm"
          variant="secondary"
          aria-expanded={open}
          data-testid="wf-step-toggle"
          onClick={() => setOpen((o) => !o)}
          icon={open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        >
          {t('workflows.step.details')}
        </Button>
      </div>
      {bad && (
        <ul className="px-4 pb-2 text-xs text-danger">
          {issues.map((i, k) => (
            <li key={k}>• {t(`workflows.issue.${i.code}`)}</li>
          ))}
        </ul>
      )}
      {open && (
        <div className="space-y-4 border-t border-hairline p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <FormField label={t('workflows.step.nameAr')} required>
              {(id) => <Input id={id} readOnly={readOnly} value={step.nameAr} onChange={(e) => onChange({ nameAr: e.target.value })} />}
            </FormField>
            <FormField label={t('workflows.step.nameEn')} required>
              {(id) => <Input id={id} dir="ltr" readOnly={readOnly} value={step.nameEn} onChange={(e) => onChange({ nameEn: e.target.value })} />}
            </FormField>
            <FormField label={t('workflows.step.key')} hint={t('workflows.step.keyHint')}>
              {(id) => <Input id={id} dir="ltr" readOnly={readOnly} value={step.key} onChange={(e) => onChange({ key: e.target.value })} />}
            </FormField>
            <FormField label={t('workflows.step.type')}>
              {(id) => (
                <Select
                  id={id}
                  disabled={readOnly}
                  value={step.stepType}
                  onChange={(v) => onChange({ stepType: v as EditableStep['stepType'] })}
                  options={[
                    { value: 'ROLE', label: t('workflows.step.type.ROLE') },
                    { value: 'DYNAMIC_CATEGORY_ROLES', label: t('workflows.step.type.DYNAMIC_CATEGORY_ROLES') },
                  ]}
                />
              )}
            </FormField>
            {step.stepType === 'ROLE' && (
              <FormField label={t('workflows.step.role')} required>
                {(id) => <LookupSelect id={id} entity="roles" disabled={readOnly} value={step.roleId} onChange={(v) => onChange({ roleId: v })} />}
              </FormField>
            )}
            <FormField label={t('workflows.step.kind')}>
              {(id) => (
                <Select
                  id={id}
                  disabled={readOnly}
                  value={step.kind}
                  onChange={(v) => onChange({ kind: v as EditableStep['kind'] })}
                  options={[
                    { value: 'APPROVAL', label: t('workflows.step.kind.APPROVAL') },
                    { value: 'PAYMENT', label: t('workflows.step.kind.PAYMENT') },
                  ]}
                />
              )}
            </FormField>
            <FormField label={t('workflows.step.group')} hint={t('workflows.step.groupHint')}>
              {(id) => (
                <div className="flex gap-1">
                  <Input id={id} list={`groups-${step.uid}`} dir="ltr" readOnly={readOnly} value={step.parallelGroup} onChange={(e) => onChange({ parallelGroup: e.target.value })} />
                  <datalist id={`groups-${step.uid}`}>
                    {groups.map((g) => (
                      <option key={g} value={g} />
                    ))}
                  </datalist>
                  {!readOnly && index > 0 && (
                    <Button size="sm" variant="secondary" onClick={onGroupWithPrev} title={t('workflows.step.groupWithPrev')}>
                      <Layers className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              )}
            </FormField>
            <FormField label={t('workflows.step.sla')}>
              {(id) => <Input id={id} inputMode="numeric" dir="ltr" readOnly={readOnly} value={step.slaHours} onChange={(e) => onChange({ slaHours: e.target.value.replace(/\D/g, '') })} />}
            </FormField>
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <Checkbox disabled={readOnly} checked={step.canEditAmounts} onChange={(v) => onChange({ canEditAmounts: v })} label={t('workflows.step.canEditAmounts')} />
            <Checkbox disabled={readOnly} checked={step.canReclassify} onChange={(v) => onChange({ canReclassify: v })} label={t('workflows.step.canReclassify')} />
            <Checkbox disabled={readOnly} checked={step.showInSignatures} onChange={(v) => onChange({ showInSignatures: v })} label={t('workflows.step.showInSignatures')} />
          </div>

          <fieldset>
            <legend className="mb-1 text-sm font-semibold text-ink-2">{t('workflows.step.actions')}</legend>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {ALL_ACTIONS.map((a) => (
                <Checkbox
                  key={a}
                  disabled={readOnly || a === 'APPROVE'}
                  checked={step.allowedActions.includes(a)}
                  onChange={(v) => onChange({ allowedActions: (v ? [...step.allowedActions, a] : step.allowedActions.filter((x) => x !== a)) as ActionCode[] })}
                  label={t(`workflows.action.${a}`)}
                />
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-1 text-sm font-semibold text-ink-2">{t('workflows.step.checklist')}</legend>
            <div className="space-y-2">
              {step.checklist.map((c, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <Input className="h-9 w-36" dir="ltr" placeholder="key" readOnly={readOnly} value={c.key} onChange={(e) => onChange({ checklist: step.checklist.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)) })} />
                  <Input className="h-9 flex-1 min-w-[8rem]" placeholder="العربية" readOnly={readOnly} value={c.labelAr} onChange={(e) => onChange({ checklist: step.checklist.map((x, j) => (j === i ? { ...x, labelAr: e.target.value } : x)) })} />
                  <Input className="h-9 flex-1 min-w-[8rem]" dir="ltr" placeholder="English" readOnly={readOnly} value={c.labelEn} onChange={(e) => onChange({ checklist: step.checklist.map((x, j) => (j === i ? { ...x, labelEn: e.target.value } : x)) })} />
                  <Checkbox disabled={readOnly} checked={c.required} onChange={(v) => onChange({ checklist: step.checklist.map((x, j) => (j === i ? { ...x, required: v } : x)) })} label={t('common.required')} />
                  {!readOnly && <Button size="sm" variant="ghost" icon={<Trash2 className="h-4 w-4" />} aria-label={t('common.remove')} onClick={() => onChange({ checklist: step.checklist.filter((_, j) => j !== i) })} />}
                </div>
              ))}
              {!readOnly && (
                <Button size="sm" variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => onChange({ checklist: [...step.checklist, { key: '', labelAr: '', labelEn: '', required: true }] })}>
                  {t('workflows.step.addChecklist')}
                </Button>
              )}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-1 text-sm font-semibold text-ink-2">{t('workflows.step.condition')}</legend>
            <ConditionEditor key={step.uid} value={step.condition} readOnly={readOnly} onChange={(c) => onChange({ condition: c })} />
          </fieldset>
        </div>
      )}
    </div>
  );
}
