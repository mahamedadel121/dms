'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { Button, FormField, Input, Modal, SegmentedControl, Select, Switch, useToast } from '@/components/ui';
import { useTr } from '../common/useTr';
import type { RequestTypeDto } from '@dms/shared';
import type { PagedResult, TemplateDto } from '../types';

type LayoutKey = 'expense-sheet' | 'generic-request';
const CODE_RE = /^[A-Z0-9_]+$/;

export function CreateTemplateDialog(p: {
  open: boolean;
  onClose: () => void;
  requestTypeId?: string;
  onCreated: (template: TemplateDto) => void;
}) {
  const { t, locale } = useTr();
  const toast = useToast();
  const [typeId, setTypeId] = useState(p.requestTypeId ?? '');
  const [code, setCode] = useState('');
  const [nameAr, setNameAr] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [layout, setLayout] = useState<LayoutKey>('generic-request');
  const [copyFrom, setCopyFrom] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (p.open) {
      setTypeId(p.requestTypeId ?? '');
      setCode('');
      setNameAr('');
      setNameEn('');
      setLayout('generic-request');
      setCopyFrom('');
      setIsDefault(false);
      setCodeError(null);
      setTouched(false);
    }
  }, [p.open, p.requestTypeId]);

  const types = useQuery({
    queryKey: ['request-types'],
    enabled: p.open,
    queryFn: async () => {
      const r = await api.get<RequestTypeDto[] | PagedResult<RequestTypeDto>>('/request-types');
      return Array.isArray(r) ? r : r.items;
    },
  });
  const sameType = useQuery({
    queryKey: ['templates', { requestTypeId: typeId }],
    enabled: p.open && !!typeId,
    queryFn: async () => {
      const r = await api.get<PagedResult<TemplateDto> | TemplateDto[]>(`/templates?requestTypeId=${encodeURIComponent(typeId)}`);
      return Array.isArray(r) ? r : r.items;
    },
  });

  const codeOk = CODE_RE.test(code) && code.length <= 40;
  const valid = !!typeId && codeOk && nameAr.trim().length > 0 && nameEn.trim().length > 0;

  const create = useMutation({
    mutationFn: () =>
      api.post<TemplateDto>('/templates', {
        requestTypeId: typeId,
        code,
        nameAr: nameAr.trim(),
        nameEn: nameEn.trim(),
        layoutKey: layout,
        isDefault,
        ...(copyFrom ? { copyFromTemplateId: copyFrom } : {}),
      }),
    onSuccess: (tpl) => {
      toast.success(t('templates.create.done'));
      p.onCreated(tpl);
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 409) setCodeError(t('templates.create.duplicate'));
      else toast.error(e);
    },
  });

  const submit = () => {
    setTouched(true);
    if (valid) create.mutate();
  };

  const typeOptions = (types.data ?? []).map((r) => ({ value: r.id, label: locale === 'ar' ? r.nameAr : r.nameEn || r.nameAr }));
  const copyOptions = (sameType.data ?? []).map((r) => ({ value: r.id, label: `${r.code} - ${locale === 'ar' ? r.nameAr : r.nameEn || r.nameAr}` }));

  return (
    <Modal
      open={p.open}
      onClose={p.onClose}
      title={t('templates.create.title')}
      testId="template-create-dialog"
      dismissable={!create.isPending}
      footer={
        <>
          <Button variant="primary" data-testid="tpl-create-submit" loading={create.isPending} disabled={touched && !valid} onClick={submit}>
            {t('templates.create.submit')}
          </Button>
          <Button variant="ghost" onClick={p.onClose} disabled={create.isPending}>
            {t('common.cancel')}
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <FormField label={t('templates.create.type')} required error={touched && !typeId ? t('templates.create.required') : null}>
          {(id) => (
            <Select
              id={id}
              data-testid="tpl-type"
              value={typeId}
              disabled={!!p.requestTypeId}
              options={typeOptions}
              placeholder={t('templates.create.typePlaceholder')}
              onChange={(v) => {
                setTypeId(v);
                setCopyFrom('');
              }}
            />
          )}
        </FormField>
        <FormField
          label={t('templates.create.code')}
          required
          hint={t('templates.create.codeHint')}
          error={codeError ?? (touched && !codeOk ? t('templates.create.codeInvalid') : null)}
        >
          {(id) => (
            <Input
              id={id}
              dir="ltr"
              data-testid="tpl-code"
              value={code}
              invalid={!!codeError || (touched && !codeOk)}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase());
                setCodeError(null);
              }}
            />
          )}
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t('templates.create.nameAr')} required error={touched && !nameAr.trim() ? t('templates.create.required') : null}>
            {(id) => <Input id={id} data-testid="tpl-name-ar" value={nameAr} onChange={(e) => setNameAr(e.target.value)} />}
          </FormField>
          <FormField label={t('templates.create.nameEn')} required error={touched && !nameEn.trim() ? t('templates.create.required') : null}>
            {(id) => <Input id={id} dir="ltr" data-testid="tpl-name-en" value={nameEn} onChange={(e) => setNameEn(e.target.value)} />}
          </FormField>
        </div>
        <FormField label={t('templates.layout.label')}>
          <SegmentedControl<LayoutKey>
            size="md"
            block
            ariaLabel={t('templates.layout.label')}
            value={layout}
            onChange={setLayout}
            items={[
              { value: 'expense-sheet', label: t('templates.layout.expense'), testId: 'tpl-layout-expense' },
              { value: 'generic-request', label: t('templates.layout.generic'), testId: 'tpl-layout-generic' },
            ]}
          />
        </FormField>
        <FormField label={t('templates.create.copyFrom')} hint={t('templates.create.copyHint')}>
          {(id) => (
            <Select
              id={id}
              data-testid="tpl-copy-from"
              value={copyFrom}
              disabled={!typeId}
              options={copyOptions}
              placeholder={t('templates.create.copyNone')}
              onChange={setCopyFrom}
            />
          )}
        </FormField>
        <Switch checked={isDefault} onChange={setIsDefault} label={t('templates.create.makeDefault')} />
      </form>
    </Modal>
  );
}
