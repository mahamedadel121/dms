'use client';

import { Check, Clock, Minus, X, AlertCircle, Layers } from 'lucide-react';
import { useTr } from '../common/useTr';
import { formatDateTime } from '@/lib/format';
import { groupStages, stepTone } from './helpers';
import type { StepDto, StepStatus } from '../types';

const toneClass: Record<ReturnType<typeof stepTone>, string> = {
  green: 'border-green-500 bg-green-50 text-green-800',
  blue: 'border-blue-500 bg-blue-50 text-blue-800 ring-2 ring-blue-200',
  amber: 'border-amber-500 bg-amber-50 text-amber-800',
  red: 'border-red-500 bg-red-50 text-red-800',
  gray: 'border-slate-300 bg-white text-slate-600',
  slate: 'border-slate-200 bg-slate-100 text-slate-400 border-dashed',
};

function StepIcon({ status }: { status: StepStatus }) {
  const c = 'h-4 w-4 shrink-0';
  switch (status) {
    case 'APPROVED':
      return <Check className={c} aria-hidden />;
    case 'ACTIVE':
      return <Clock className={c} aria-hidden />;
    case 'AWAITING_CORRECTION':
      return <AlertCircle className={c} aria-hidden />;
    case 'REJECTED':
      return <X className={c} aria-hidden />;
    case 'NOT_APPLICABLE':
    case 'CANCELLED':
      return <Minus className={c} aria-hidden />;
    default:
      return <span className="h-2 w-2 rounded-full bg-current opacity-50" aria-hidden />;
  }
}

/** Horizontal (wraps on mobile) progress bar; parallel steps stack inside one stage; N/A steps are dashed. */
export function ProgressBar({ steps }: { steps: StepDto[] }) {
  const { t, locale } = useTr();
  const stages = groupStages(steps);
  return (
    <ol className="flex flex-wrap items-stretch gap-2" aria-label={t('requests.progress.title')}>
      {stages.map((stage, i) => (
        <li key={stage.stageIndex} className="flex items-stretch gap-2">
          <div className={`flex flex-col gap-1 ${stage.steps.length > 1 ? 'rounded-lg border border-dashed border-slate-300 p-1' : ''}`}>
            {stage.steps.length > 1 && (
              <span className="flex items-center gap-1 px-1 text-[11px] text-slate-500">
                <Layers className="h-3 w-3" aria-hidden /> {t('requests.progress.parallel')}
              </span>
            )}
            {stage.steps.map((s) => (
              <div
                key={s.id}
                className={`min-w-[8.5rem] rounded-md border px-2 py-1.5 text-xs ${toneClass[stepTone(s.status)]}`}
                title={[s.comment, s.actedAt ? formatDateTime(s.actedAt) : ''].filter(Boolean).join(' — ')}
              >
                <div className="flex items-center gap-1 font-semibold">
                  <StepIcon status={s.status} />
                  <span className={s.status === 'NOT_APPLICABLE' ? 'line-through' : ''}>
                    {locale === 'ar' ? s.nameAr : s.nameEn || s.nameAr}
                  </span>
                </div>
                <div className="mt-0.5 opacity-80">{t(`requests.stepStatus.${s.status}`)}</div>
                {s.actedByName && (
                  <div className="opacity-80">
                    {s.actedByName}
                    {s.onBehalfOfName ? ` (${t('requests.onBehalfOf', { name: s.onBehalfOfName })})` : ''}
                  </div>
                )}
                {s.actedAt && <div className="opacity-70">{formatDateTime(s.actedAt)}</div>}
              </div>
            ))}
          </div>
          {i < stages.length - 1 && <span className="self-center text-slate-300 rtl:rotate-180" aria-hidden>›</span>}
        </li>
      ))}
    </ol>
  );
}
