'use client';

import { AlertTriangle, Edit3, MessageSquareWarning } from 'lucide-react';
import { Badge, Card } from '@/components/ui/Display';
import { Button } from '@/components/ui/Button';
import { formatDateTime, formatEgp, formatNumber } from '@/lib/format';
import { useTr } from '../common/useTr';
import { categoryLabel, pricePerLiter } from './helpers';
import { ImageGallery } from './ImageGallery';
import type { CorrectionDto, LineDto } from '../types';

export function LineCard({
  line,
  corrections,
  canEdit,
  canCorrect,
  onEdit,
  onCorrect,
}: {
  line: LineDto;
  corrections: CorrectionDto[];
  canEdit: boolean;
  canCorrect: boolean;
  onEdit: () => void;
  onCorrect: (target: string) => void;
}) {
  const { t, locale } = useTr();
  const catChanged = line.originalCategory.id !== line.category.id;
  const amountChanged = line.originalAmount !== line.amount;
  const ppl = pricePerLiter(line);
  const open = corrections.filter((c) => c.status === 'OPEN' && (c.lineId === line.id || line.attachments.some((a) => a.id === c.attachmentId)));
  const extra = Object.entries(line.extraValues ?? {}).filter(([, v]) => v !== '' && v !== null);

  return (
    <Card padded className={line.warnings.length > 0 || open.length > 0 ? 'border-amber-300' : ''}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">#{line.lineNo}</span>
            <h4 className="font-bold text-slate-900">{categoryLabel(line.category, locale)}</h4>
            {catChanged && (
              <Badge tone="amber">
                {t('requests.line.reclassifiedFrom', { name: categoryLabel(line.originalCategory, locale) })}
              </Badge>
            )}
            {line.isEdited && <Badge tone="purple">{t('requests.line.edited')}</Badge>}
          </div>
          {line.lineDate && <p className="mt-0.5 text-xs text-slate-500">{formatDateTime(line.lineDate).slice(0, 10)}</p>}
        </div>
        <div className="text-end">
          {amountChanged ? (
            <>
              <div className="text-xs text-slate-500 line-through tabular-nums" title={t('requests.line.driverAmount')}>
                {formatEgp(line.originalAmount, locale)}
              </div>
              <div className="text-lg font-bold text-purple-800 tabular-nums" title={t('requests.line.correctedAmount')}>
                {formatEgp(line.amount, locale)}
              </div>
            </>
          ) : (
            <div className="text-lg font-bold tabular-nums">{formatEgp(line.amount, locale)}</div>
          )}
        </div>
      </div>

      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
        {line.quantity && <Info label={t('requests.line.quantity')} value={formatNumber(line.quantity)} />}
        {ppl !== null && <Info label={t('requests.line.pricePerLiter')} value={formatNumber(ppl)} />}
        {extra.map(([k, v]) => (
          <Info key={k} label={k} value={String(v)} />
        ))}
        {line.note && <Info label={t('requests.line.note')} value={line.note} />}
      </dl>

      {line.warnings.length > 0 && (
        <ul className="mt-2 space-y-1">
          {line.warnings.map((w, i) => (
            <li key={w.code + i} className="flex items-start gap-1.5 rounded bg-amber-50 px-2 py-1 text-xs text-amber-900">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              {locale === 'ar' ? w.messageAr : w.messageEn || w.messageAr}
            </li>
          ))}
        </ul>
      )}

      {open.length > 0 && (
        <ul className="mt-2 space-y-1">
          {open.map((c) => (
            <li key={c.id} className="rounded bg-orange-50 px-2 py-1 text-xs text-orange-900">
              {t('requests.line.openCorrection')}: {c.comment}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3">
        <ImageGallery
          attachments={line.attachments}
          renderActions={
            canCorrect
              ? (a) =>
                  a.isCurrent ? (
                    <button type="button" onClick={() => onCorrect(`att:${a.id}`)} className="mt-0.5 text-xs text-amber-800 underline">
                      {t('requests.line.askFix')}
                    </button>
                  ) : null
              : undefined
          }
        />
      </div>

      {line.edits.length > 0 && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer font-semibold text-slate-700">{t('requests.line.edits', { n: line.edits.length })}</summary>
          <ul className="mt-1 space-y-1 text-xs text-slate-600">
            {line.edits.map((e) => (
              <li key={e.id} className="rounded bg-slate-50 p-2">
                <b>{t(`requests.editField.${e.field}`)}</b>: {e.oldLabel ?? e.oldValue ?? '—'} → {e.newLabel ?? e.newValue ?? '—'}
                <span className="block text-slate-500">
                  {e.reason} · {e.editedByName ?? t(e.source === 'SUBMITTER_CORRECTION' ? 'requests.line.byDriver' : 'requests.timeline.unknown')} · {formatDateTime(e.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {(canEdit || canCorrect) && (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
          {canEdit && (
            <Button size="sm" variant="secondary" icon={<Edit3 className="h-4 w-4" />} onClick={onEdit}>
              {t('requests.line.editBtn')}
            </Button>
          )}
          {canCorrect && (
            <Button size="sm" variant="secondary" icon={<MessageSquareWarning className="h-4 w-4" />} onClick={() => onCorrect(`line:${line.id}`)}>
              {t('requests.line.askFixLine')}
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
