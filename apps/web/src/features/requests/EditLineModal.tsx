'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { parseAmount, type EditLineBody, type RequestTypeDto } from '@dms/shared';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { FormField, Input, Select, Textarea } from '@/components/ui/Fields';
import { Modal } from '@/components/ui/Modal';
import { formatEgp } from '@/lib/format';
import { useTr } from '../common/useTr';
import { categoryLabel } from './helpers';
import type { LineDto, RequestDetail } from '../types';

/** Accountant / chief accountant: edit amount and/or reclassify one line, with a mandatory reason. */
export function EditLineModal({
  detail,
  line,
  onClose,
  onDone,
  onError,
}: {
  detail: RequestDetail;
  line: LineDto | null;
  onClose: () => void;
  onDone: () => void;
  onError: (e: unknown) => void;
}) {
  const { t, locale } = useTr();
  const my = detail.myActions;
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (line) {
      setAmount(line.amount);
      setCategoryId(line.category.id);
      setReason('');
      setErr(null);
    }
  }, [line]);

  const type = useQuery({
    queryKey: ['request-type', detail.requestType.id],
    queryFn: () => api.get<RequestTypeDto>(`/request-types/${detail.requestType.id}`),
    enabled: !!line && !!my?.reclassify,
    staleTime: 60_000,
  });

  const save = useMutation({
    mutationFn: (body: EditLineBody) => api.patch(`/requests/${detail.id}/lines/${line!.id}`, body),
    onSuccess: onDone,
    onError,
  });

  if (!line || !my) return null;

  const submit = () => {
    const body: EditLineBody = { stepInstanceId: my.stepInstanceId, reason: reason.trim() };
    if (my.editAmounts && amount !== line.amount) {
      const parsed = parseAmount(amount, { allowZero: true });
      if (parsed === null) {
        setErr(t('requests.edit.badAmount'));
        return;
      }
      if (parsed !== line.amount) body.amount = parsed;
    }
    if (my.reclassify && categoryId && categoryId !== line.category.id) body.categoryId = categoryId;
    if (body.amount === undefined && body.categoryId === undefined) {
      setErr(t('requests.edit.nothingChanged'));
      return;
    }
    if (!body.reason) {
      setErr(t('requests.edit.reasonRequired'));
      return;
    }
    setErr(null);
    save.mutate(body);
  };

  const cats = (type.data?.lineCategories ?? []).filter((c) => c.isActive || c.id === line.category.id);

  return (
    <Modal
      open
      onClose={onClose}
      title={t('requests.edit.title', { n: line.lineNo })}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button loading={save.isPending} onClick={submit}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="rounded-md bg-slate-50 p-2 text-sm text-slate-700">
          {t('requests.edit.original')}: <b className="tabular-nums">{formatEgp(line.originalAmount, locale)}</b> — {categoryLabel(line.originalCategory, locale)}
        </p>
        {my.editAmounts && (
          <FormField label={t('requests.edit.amount')}>
            {(id) => <Input id={id} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />}
          </FormField>
        )}
        {my.reclassify && (
          <FormField label={t('requests.edit.category')}>
            {(id) => (
              <Select
                id={id}
                value={categoryId}
                onChange={setCategoryId}
                options={
                  cats.length > 0
                    ? cats.map((c) => ({ value: c.id, label: categoryLabel(c, locale) }))
                    : [{ value: line.category.id, label: categoryLabel(line.category, locale) }]
                }
              />
            )}
          </FormField>
        )}
        <FormField label={t('requests.edit.reason')} required error={err}>
          {(id) => <Textarea id={id} value={reason} onChange={(e) => setReason(e.target.value)} />}
        </FormField>
        <p className="text-xs text-slate-500">{t('requests.edit.note')}</p>
      </div>
    </Modal>
  );
}
