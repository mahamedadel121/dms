'use client';

import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { FormField, Select, Textarea } from '@/components/ui/Fields';
import { Icon } from '@/components/ui/Icon';
import { Modal } from '@/components/ui/Modal';
import { useTr } from '../common/useTr';
import { categoryLabel } from './helpers';
import type { RequestDetail } from '../types';

type Reason = 'IMAGE_UNCLEAR' | 'WRONG_AMOUNT' | 'MISSING_IMAGE' | 'OTHER';
type Fix = 'REUPLOAD' | 'AMOUNT' | 'BOTH';
interface Item {
  target: string; // line:<id> | att:<id>
  reasonCode: Reason;
  fixType: Fix;
  comment: string;
}
const REASONS: Reason[] = ['IMAGE_UNCLEAR', 'WRONG_AMOUNT', 'MISSING_IMAGE', 'OTHER'];
const FIXES: Fix[] = ['REUPLOAD', 'AMOUNT', 'BOTH'];

export function CorrectionModal({
  open,
  onClose,
  detail,
  initialTarget,
  onDone,
  onError,
}: {
  open: boolean;
  onClose: () => void;
  detail: RequestDetail;
  initialTarget?: string;
  onDone: () => void;
  onError: (e: unknown) => void;
}) {
  const { t, locale } = useTr();
  const targets: { value: string; label: string }[] = [];
  for (const l of detail.lines) {
    const cat = typeof l.category === 'string' ? l.category : categoryLabel(l.category, locale);
    targets.push({ value: `line:${l.id}`, label: `${t('requests.line.n', { n: l.lineNo })} — ${cat}` });
    l.attachments
      .filter((a) => a.isCurrent)
      .forEach((a, i) => targets.push({ value: `att:${a.id}`, label: `${t('requests.line.n', { n: l.lineNo })} — ${t('requests.correction.image', { n: i + 1 })}` }));
  }
  const blank = (target?: string): Item => ({ target: target ?? targets[0]?.value ?? '', reasonCode: 'IMAGE_UNCLEAR', fixType: 'REUPLOAD', comment: '' });
  const [items, setItems] = useState<Item[]>([blank(initialTarget)]);
  useEffect(() => {
    if (open) setItems([blank(initialTarget)]);
  }, [open, initialTarget]);

  const upd = (i: number, patch: Partial<Item>) => setItems((l) => l.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const send = useMutation({
    mutationFn: () =>
      api.post(`/requests/${detail.id}/steps/${detail.myActions!.stepInstanceId}/request-correction`, {
        items: items.map((it) => {
          const [kind, id] = it.target.split(':');
          return {
            lineId: kind === 'line' ? id : undefined,
            attachmentId: kind === 'att' ? id : undefined,
            reasonCode: it.reasonCode,
            fixType: it.fixType,
            comment: it.comment.trim(),
          };
        }),
      }),
    onSuccess: onDone,
    onError,
  });
  const valid = items.length > 0 && items.every((i) => i.target && i.comment.trim());

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      testId="correction-dialog"
      title={t('requests.correction.title')}
      footer={
        <>
          <Button loading={send.isPending} disabled={!valid} onClick={() => send.mutate()} data-testid="correction-send">
            {t('requests.correction.send')}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-ink-2">{t('requests.correction.hint')}</p>
      <div className="space-y-4">
        {items.map((it, i) => (
          <div key={i} className="space-y-2 rounded-lg border border-hairline bg-surface-2 p-3">
            <div className="grid gap-2 sm:grid-cols-3">
              <FormField label={t('requests.correction.target')}>
                {(id) => <Select id={id} value={it.target} onChange={(v) => upd(i, { target: v })} options={targets} />}
              </FormField>
              <FormField label={t('requests.correction.reason')}>
                {(id) => (
                  <Select
                    id={id}
                    value={it.reasonCode}
                    onChange={(v) => upd(i, { reasonCode: v as Reason })}
                    options={REASONS.map((r) => ({ value: r, label: t(`requests.correction.reason.${r}`) }))}
                  />
                )}
              </FormField>
              <FormField label={t('requests.correction.fix')}>
                {(id) => (
                  <Select
                    id={id}
                    value={it.fixType}
                    onChange={(v) => upd(i, { fixType: v as Fix })}
                    options={FIXES.map((r) => ({ value: r, label: t(`requests.correction.fix.${r}`) }))}
                  />
                )}
              </FormField>
            </div>
            <FormField label={t('requests.action.commentRequired')} required>
              {(id) => <Textarea id={id} rows={2} value={it.comment} onChange={(e) => upd(i, { comment: e.target.value })} />}
            </FormField>
            {items.length > 1 && (
              <Button size="sm" variant="ghost" icon={<Icon as={Trash2} size={16} />} onClick={() => setItems((l) => l.filter((_, j) => j !== i))}>
                {t('common.remove')}
              </Button>
            )}
          </div>
        ))}
        <Button size="sm" variant="secondary" icon={<Icon as={Plus} size={16} />} onClick={() => setItems((l) => [...l, blank()])}>
          {t('requests.correction.addItem')}
        </Button>
      </div>
    </Modal>
  );
}
