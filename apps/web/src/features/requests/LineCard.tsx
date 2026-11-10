'use client';

import { AlertTriangle, FileText, MessageSquareWarning, PencilLine } from 'lucide-react';
import { Badge, Banner, Button, DateText, Num, Money } from '@/components/ui';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/cn';
import { useTr } from '../common/useTr';
import { categoryLabel, pricePerLiter } from './helpers';
import type { CorrectionDto, LineDto } from '../types';

export function LineCard({
  line,
  corrections,
  canEdit,
  canCorrect,
  onEdit,
  onCorrect,
  activeAttachmentId,
  onSelectAttachment,
}: {
  line: LineDto;
  corrections: CorrectionDto[];
  canEdit: boolean;
  canCorrect: boolean;
  onEdit: () => void;
  onCorrect: (target: string) => void;
  activeAttachmentId?: string | null;
  onSelectAttachment?: (attachmentId: string) => void;
}) {
  const { t, locale } = useTr();
  const catChanged = line.originalCategory.id !== line.category.id;
  const ppl = pricePerLiter(line);
  const open = corrections.filter((c) => c.status === 'OPEN' && (c.lineId === line.id || line.attachments.some((a) => a.id === c.attachmentId)));
  const extra = Object.entries(line.extraValues ?? {}).filter(([, v]) => v !== '' && v !== null);
  const current = line.attachments.filter((a) => a.isCurrent);
  const hasActive = !!activeAttachmentId && current.some((a) => a.id === activeAttachmentId);

  return (
    <div
      data-testid={'line-' + line.lineNo}
      className={cn('border-t border-hairline px-5 py-4 first:border-t-0', hasActive && 'border-s-[3px] border-s-brass bg-primary-tint/40')}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="gray" size="sm">
          <span className="num">#{line.lineNo}</span>
        </Badge>
        <h4 className="text-base font-medium text-ink">{categoryLabel(line.category, locale)}</h4>
        {catChanged && (
          <Badge tone="brass" size="sm">
            {t('requests.line.reclassifiedFrom', { name: categoryLabel(line.originalCategory, locale) })}
          </Badge>
        )}
        <span className="ms-auto">
          <Money size="lg" value={line.amount} original={line.originalAmount} />
        </span>
      </div>

      <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-ink-3">
        {line.lineDate && <DateText value={line.lineDate} />}
        {line.quantity && (
          <span>
            · {t('requests.line.quantity')} <Num value={line.quantity} />
          </span>
        )}
        {ppl !== null && (
          <span>
            · {t('requests.line.pricePerLiter')} <Num value={ppl} />
          </span>
        )}
        {extra.map(([k, v]) => (
          <span key={k}>
            · {k} <bdi>{String(v)}</bdi>
          </span>
        ))}
        {line.note && (
          <span dir="auto">
            · {t('requests.line.note')}: {line.note}
          </span>
        )}
      </p>

      {line.warnings.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {line.warnings.map((w, i) => (
            <Badge key={w.code + i} tone="amber" icon={<Icon as={AlertTriangle} size={14} />}>
              {locale === 'ar' ? w.messageAr : w.messageEn || w.messageAr}
            </Badge>
          ))}
        </div>
      )}

      {open.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {open.map((c) => (
            <Banner key={c.id} tone="warning">
              <span dir="auto">
                {t('requests.line.openCorrection')}: {c.comment}
              </span>
            </Banner>
          ))}
        </div>
      )}

      {current.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {current.map((a, idx) => {
            const isPdf = a.mimeType === 'application/pdf';
            const active = a.id === activeAttachmentId;
            return (
              <button
                key={a.id}
                type="button"
                data-testid="line-thumb"
                aria-pressed={active}
                aria-label={`${t('requests.line.n', { n: line.lineNo })} · ${idx + 1}`}
                onClick={() => onSelectAttachment?.(a.id)}
                className={cn(
                  'flex h-14 w-14 items-center justify-center overflow-hidden rounded border border-hairline bg-surface-2',
                  active && 'ring-2 ring-primary',
                )}
              >
                {isPdf ? (
                  <Icon as={FileText} size={24} className="text-ink-3" />
                ) : (
                  <img src={a.thumbUrl ?? a.url} alt="" className="h-full w-full object-cover" />
                )}
              </button>
            );
          })}
        </div>
      )}

      {(canEdit || canCorrect) && (
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          {canEdit && (
            <Button size="sm" variant="ghost" data-testid={'line-edit-' + line.lineNo} icon={<Icon as={PencilLine} size={16} />} onClick={onEdit}>
              {t('requests.line.editBtn')}
            </Button>
          )}
          {canCorrect && (
            <Button
              size="sm"
              variant="ghost"
              data-testid={'line-correct-' + line.lineNo}
              icon={<Icon as={MessageSquareWarning} size={16} />}
              onClick={() => onCorrect(`line:${line.id}`)}
            >
              {t('requests.line.askFixLine')}
            </Button>
          )}
        </div>
      )}

      {line.edits.length > 0 && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer font-medium text-ink-2">{t('requests.line.history', { n: line.edits.length })}</summary>
          <ul className="mt-2 space-y-1.5 text-xs text-ink-2">
            {line.edits.map((e) => (
              <li key={e.id} className="rounded bg-surface-2 p-2">
                <b>{t(`requests.editField.${e.field}`)}</b>: <bdi className="num">{e.oldLabel ?? e.oldValue ?? '—'}</bdi> {'→'}{' '}
                <bdi className="num">{e.newLabel ?? e.newValue ?? '—'}</bdi>
                <span className="block text-ink-3">
                  <q dir="auto">{e.reason}</q> · {e.editedByName ?? t(e.source === 'SUBMITTER_CORRECTION' ? 'requests.line.byDriver' : 'requests.timeline.unknown')} ·{' '}
                  <DateText value={e.createdAt} mode="dayTime" />
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
