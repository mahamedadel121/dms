'use client';

import { useState } from 'react';
import { Ban, Check, ChevronDown, GitFork, MessageSquareWarning, Minus, X } from 'lucide-react';
import { Badge, DateText } from '@/components/ui';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/cn';
import { formatCount } from '@/lib/format';
import { useMediaQuery } from '@/lib/useMediaQuery';
import { useTr } from '../common/useTr';
import { groupStages, type Stage } from './helpers';
import { currentPosition, isStageDone } from './routeModel';
import type { StepDto, StepStatus } from '../types';

type Tr = ReturnType<typeof useTr>;

function nodeClass(status: StepStatus): string {
  switch (status) {
    case 'APPROVED':
      return 'bg-primary text-on-primary';
    case 'ACTIVE':
      return 'border-2 border-primary bg-surface animate-ring-once';
    case 'AWAITING_CORRECTION':
      return 'border-2 border-warning bg-warning-bg text-warning';
    case 'NOT_APPLICABLE':
      return 'border border-dashed border-line bg-surface text-ink-disabled';
    case 'REJECTED':
      return 'bg-danger text-on-danger';
    default:
      return 'border border-line bg-surface text-ink-3';
  }
}

function NodeIcon({ status }: { status: StepStatus }) {
  switch (status) {
    case 'APPROVED':
      return <Icon as={Check} size={16} />;
    case 'ACTIVE':
      return <span className="h-2.5 w-2.5 rounded-full bg-primary" aria-hidden />;
    case 'AWAITING_CORRECTION':
      return <Icon as={MessageSquareWarning} size={14} />;
    case 'NOT_APPLICABLE':
      return <Icon as={Minus} size={14} />;
    case 'REJECTED':
      return <Icon as={X} size={16} />;
    case 'CANCELLED':
      return <Icon as={Ban} size={14} />;
    default:
      return null;
  }
}

function Node({ step }: { step: StepDto }) {
  const { t } = useTr();
  return (
    <span
      data-testid={'step-' + step.stepKey}
      data-status={step.status}
      role="img"
      aria-label={t(`requests.stepStatus.${step.status}`)}
      className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full', nodeClass(step.status))}
    >
      <NodeIcon status={step.status} />
    </span>
  );
}

function stepName(s: StepDto, locale: Tr['locale']): string {
  return locale === 'ar' ? s.nameAr : s.nameEn || s.nameAr;
}

function Caption({ step, tr }: { step: StepDto; tr: Tr }) {
  const { t, locale } = tr;
  switch (step.status) {
    case 'APPROVED':
      return (
        <span className="text-xs text-ink-3">
          {step.actedByName}
          {step.onBehalfOfName ? ` (${t('requests.onBehalfOf', { name: step.onBehalfOfName })})` : ''} {step.actedAt && <DateText value={step.actedAt} />}
        </span>
      );
    case 'ACTIVE': {
      let due: { text: string; overdue: boolean } | null = null;
      if (step.dueAt) {
        const h = (new Date(step.dueAt).getTime() - Date.now()) / 3_600_000;
        const abs = formatCount(Math.max(1, Math.round(Math.abs(h))));
        due = h >= 0 ? { text: t('requests.step.dueIn', { h: abs }), overdue: false } : { text: t('requests.step.overdueBy', { h: abs }), overdue: true };
      }
      return (
        <span className="flex flex-col items-start gap-0.5">
          <Badge tone="navy" size="sm">
            {t('requests.step.now')}
          </Badge>
          {due && <span className={cn('text-xs', due.overdue ? 'text-danger' : 'text-ink-3')}>{due.text}</span>}
        </span>
      );
    }
    case 'AWAITING_CORRECTION':
      return <span className="text-xs text-ink-3">{t('requests.stepStatus.AWAITING_CORRECTION')}</span>;
    case 'NOT_APPLICABLE':
      return <span className="text-xs text-ink-3">{t('requests.step.notApplicable')}</span>;
    case 'PENDING':
      return <span className="text-xs text-ink-3">{locale === 'ar' ? step.roleNameAr : step.roleNameEn || step.roleNameAr}</span>;
    default:
      return <span className="text-xs text-ink-3">{t(`requests.stepStatus.${step.status}`)}</span>;
  }
}

function Labels({ step, tr, center }: { step: StepDto; tr: Tr; center?: boolean }) {
  const tone = step.status === 'ACTIVE' ? 'font-semibold text-ink' : step.status === 'NOT_APPLICABLE' ? 'font-medium text-ink-3' : 'font-medium text-ink-2';
  return (
    <span className={cn('flex min-w-0 flex-col gap-0.5', center ? 'items-center text-center' : 'items-start text-start')}>
      <span className={cn('text-13', tone)}>{stepName(step, tr.locale)}</span>
      <Caption step={step} tr={tr} />
    </span>
  );
}

function SkippedNode({ stage, tr }: { stage: Stage; tr: Tr }) {
  return (
    <div className="flex flex-col items-center gap-1.5 text-center" data-testid={'stage-skipped-' + stage.stageIndex}>
      <span className="flex h-7 w-7 items-center justify-center rounded-full border border-dashed border-line bg-surface text-ink-disabled">
        <Icon as={Minus} size={14} />
      </span>
      <span className="text-13 text-ink-3">{tr.t('requests.step.skippedGroup')}</span>
    </div>
  );
}

function ParallelBox({ stage, tr }: { stage: Stage; tr: Tr }) {
  return (
    <div className="rounded-lg border border-dashed border-line px-3 py-2">
      <div className="mb-1.5 flex items-center gap-1 text-xs text-ink-3">
        <Icon as={GitFork} size={14} /> {tr.t('requests.step.parallel')}
      </div>
      <div className="flex flex-col gap-2">
        {stage.steps.map((s) => (
          <div key={s.id} className="flex items-start gap-2.5">
            <Node step={s} />
            <Labels step={s} tr={tr} />
          </div>
        ))}
      </div>
    </div>
  );
}

function Horizontal({ stages, tr }: { stages: Stage[]; tr: Tr }) {
  return (
    <ol className="flex items-start" aria-label={tr.t('requests.progress.title')}>
      {stages.map((stage, i) => {
        const only = stage.steps[0];
        return (
          <li key={stage.stageIndex} className={cn('flex items-start', i < stages.length - 1 && 'flex-1')}>
            <div className="flex min-w-[96px] max-w-[180px] flex-col items-center">
              {stage.skipped ? (
                <SkippedNode stage={stage} tr={tr} />
              ) : stage.steps.length > 1 || !only ? (
                <ParallelBox stage={stage} tr={tr} />
              ) : (
                <div className="flex flex-col items-center gap-1.5">
                  <Node step={only} />
                  <Labels step={only} tr={tr} center />
                </div>
              )}
            </div>
            {i < stages.length - 1 && <span aria-hidden className={cn('mt-3.5 h-0.5 min-w-4 flex-1', isStageDone(stage) ? 'bg-primary' : 'bg-hairline')} />}
          </li>
        );
      })}
    </ol>
  );
}

function Vertical({ stages, tr }: { stages: Stage[]; tr: Tr }) {
  return (
    <ol className="flex flex-col" aria-label={tr.t('requests.progress.title')}>
      {stages.map((stage, i) => {
        const only = stage.steps[0];
        const single = !stage.skipped && stage.steps.length === 1 && only;
        return (
          <li key={stage.stageIndex} className="flex gap-3">
            <div className="flex flex-col items-center">
              {single ? (
                <Node step={single} />
              ) : (
                <span className="flex h-7 w-7 items-center justify-center rounded-full border border-dashed border-line bg-surface text-ink-3">
                  <Icon as={stage.skipped ? Minus : GitFork} size={14} />
                </span>
              )}
              {i < stages.length - 1 && <span aria-hidden className={cn('w-0.5 flex-1', isStageDone(stage) ? 'bg-primary' : 'bg-hairline')} />}
            </div>
            <div className="min-w-0 flex-1 pb-4 pt-0.5">
              {stage.skipped ? (
                <span className="text-13 text-ink-3">{tr.t('requests.step.skippedGroup')}</span>
              ) : single ? (
                <Labels step={single} tr={tr} />
              ) : (
                <ParallelBox stage={stage} tr={tr} />
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function RouteStepper({
  steps,
  orientation = 'auto',
  compact = false,
}: {
  steps: StepDto[];
  orientation?: 'auto' | 'horizontal' | 'vertical';
  compact?: boolean;
}) {
  const tr = useTr();
  const wide = useMediaQuery('(min-width: 768px)');
  const [open, setOpen] = useState(false);
  const stages = groupStages(steps);

  if (compact) {
    const pos = currentPosition(stages);
    const current = steps.find((s) => s.status === 'ACTIVE' || s.status === 'AWAITING_CORRECTION') ?? null;
    return (
      <div data-testid="route-stepper" className="space-y-3">
        <div className="flex items-center gap-3">
          {current && <Node step={current} />}
          <div className="min-w-0 flex-1">
            {current && <div className="truncate text-13 font-semibold text-ink">{stepName(current, tr.locale)}</div>}
            {pos && <div className="text-xs text-ink-3">{tr.t('requests.step.position', { i: formatCount(pos.i), n: formatCount(pos.n) })}</div>}
          </div>
          <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="inline-flex items-center gap-1 text-sm text-link">
            {tr.t('requests.step.showRoute')}
            <Icon as={ChevronDown} size={16} className={open ? 'rotate-180' : ''} />
          </button>
        </div>
        {open && <Vertical stages={stages} tr={tr} />}
      </div>
    );
  }

  const horizontal = orientation === 'horizontal' || (orientation === 'auto' && wide);
  return (
    <div data-testid="route-stepper" className="overflow-x-auto">
      {horizontal ? <Horizontal stages={stages} tr={tr} /> : <Vertical stages={stages} tr={tr} />}
    </div>
  );
}
