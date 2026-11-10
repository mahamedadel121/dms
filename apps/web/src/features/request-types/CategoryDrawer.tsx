'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ATTACHMENT_MIME_TYPES, type AttachmentMimeType, type LineCategoryDto } from '@dms/shared';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { Button, Checkbox, Drawer, FormField, Input, LookupMultiSelect, Select, Switch, fieldErrorsFromApi, useToast } from '@/components/ui';
import { FieldListEditor } from './FieldListEditor';
import {
  MIME_LABELS,
  categoryToForm,
  emptyCategoryForm,
  hasFieldErrors,
  toCategoryInput,
  validateCategory,
  validateFields,
  type CategoryForm,
} from './model';

export interface CategoryDrawerProps {
  open: boolean;
  onClose: () => void;
  requestTypeId: string;
  /** null = create */
  category: LineCategoryDto | null;
  /** sort order given to a new category (last position) */
  nextSortOrder: number;
}

export function CategoryDrawer({ open, onClose, requestTypeId, category, nextSortOrder }: CategoryDrawerProps) {
  const { t } = useT();
  const toast = useToast();
  const qc = useQueryClient();
  const mode = category ? 'edit' : 'create';
  const [form, setForm] = useState<CategoryForm>(emptyCategoryForm(nextSortOrder));
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setForm(category ? categoryToForm(category) : emptyCategoryForm(nextSortOrder));
    setErrors({});
  }, [open, category, nextSortOrder]);

  const set = <K extends keyof CategoryForm>(k: K, v: CategoryForm[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => (e[k] ? { ...e, [k]: '' } : e));
  };
  const err = (k: string) => (errors[k] ? (errors[k].startsWith('rt.') ? t(errors[k]) : errors[k]) : undefined);
  const numberFields = useMemo(() => form.extraFields.filter((f) => f.type === 'number' && f.key), [form.extraFields]);

  const save = useMutation({
    mutationFn: async () => {
      const body = toCategoryInput(form);
      if (category) {
        const { code: _code, sortOrder: _sort, ...patch } = body;
        void _code;
        void _sort;
        return api.patch(`/request-types/${requestTypeId}/line-categories/${category.id}`, patch);
      }
      return api.post(`/request-types/${requestTypeId}/line-categories`, body);
    },
    onSuccess: () => {
      toast.success(t('common.saved'));
      void qc.invalidateQueries({ queryKey: ['request-type', requestTypeId] });
      void qc.invalidateQueries({ queryKey: ['request-types'] });
      onClose();
    },
    onError: (e) => {
      setErrors((cur) => ({ ...cur, ...fieldErrorsFromApi(e) }));
      toast.error(e);
    },
  });

  function submit() {
    const e = validateCategory(form, mode);
    if (hasFieldErrors(validateFields(form.extraFields))) e.extraFields = 'rt.err.FIELDS_INVALID';
    setErrors(e);
    if (Object.keys(e).length) return;
    save.mutate();
  }

  const toggleMime = (m: AttachmentMimeType, on: boolean) =>
    set('allowedMimeTypes', on ? [...form.allowedMimeTypes, m] : form.allowedMimeTypes.filter((x) => x !== m));
  const intOf = (v: string, fallback: number) => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="lg"
      testId="rt-cat-form"
      title={category ? t('rt.cat.edit') : t('rt.cat.add')}
      footer={
        <>
          <Button loading={save.isPending} onClick={submit} data-testid="rt-cat-save">{t('common.save')}</Button>
          <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
        </>
      }
    >
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t('common.code')} required={mode === 'create'} error={err('code')} hint={t('rt.cat.codeHint')}>
            {(id) => (
              <Input id={id} dir="ltr" disabled={mode === 'edit'} value={form.code} invalid={!!errors.code} data-testid="rt-cat-code" onChange={(e) => set('code', e.target.value.toUpperCase())} />
            )}
          </FormField>
          <FormField label={t('rt.cat.icon')} hint={t('rt.cat.iconHint')}>
            {(id) => <Input id={id} dir="ltr" value={form.icon} onChange={(e) => set('icon', e.target.value)} />}
          </FormField>
          <FormField label={t('common.nameAr')} required error={err('nameAr')}>
            {(id) => <Input id={id} value={form.nameAr} invalid={!!errors.nameAr} onChange={(e) => set('nameAr', e.target.value)} />}
          </FormField>
          <FormField label={t('common.nameEn')} required error={err('nameEn')}>
            {(id) => <Input id={id} dir="ltr" value={form.nameEn} invalid={!!errors.nameEn} onChange={(e) => set('nameEn', e.target.value)} />}
          </FormField>
          <div className="sm:col-span-2">
            <Switch checked={form.isActive} onChange={(v) => set('isActive', v)} label={t('common.active')} />
          </div>
        </div>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-ink">{t('rt.cat.amounts')}</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField label={t('rt.cat.unitPriceMin')} error={err('unitPriceMin')}>
              {(id) => <Input id={id} numeric value={form.unitPriceMin} invalid={!!errors.unitPriceMin} onChange={(e) => set('unitPriceMin', e.target.value)} />}
            </FormField>
            <FormField label={t('rt.cat.unitPriceMax')} error={err('unitPriceMax')}>
              {(id) => <Input id={id} numeric value={form.unitPriceMax} invalid={!!errors.unitPriceMax} onChange={(e) => set('unitPriceMax', e.target.value)} />}
            </FormField>
            <FormField label={t('rt.cat.maxAmountWarning')} error={err('maxAmountWarning')}>
              {(id) => <Input id={id} numeric value={form.maxAmountWarning} invalid={!!errors.maxAmountWarning} onChange={(e) => set('maxAmountWarning', e.target.value)} />}
            </FormField>
          </div>
          <FormField label={t('rt.cat.quantityField')} hint={t('rt.cat.quantityHint')} error={err('quantityFieldKey')}>
            {(id) => (
              <Select
                id={id}
                value={form.quantityFieldKey}
                invalid={!!errors.quantityFieldKey}
                placeholder={t('rt.cat.noQuantity')}
                options={numberFields.map((f) => ({ value: f.key, label: `${f.labelAr || f.key} (${f.key})` }))}
                onChange={(v) => set('quantityFieldKey', v)}
              />
            )}
          </FormField>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-ink">{t('rt.cat.approvalRoles')}</h3>
          <LookupMultiSelect entity="roles" value={form.approvalRoleIds} onChange={(ids) => set('approvalRoleIds', ids)} />
          <p className="text-xs text-ink-3">{t('rt.cat.approvalRolesHint')}</p>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-ink">{t('rt.cat.extraFields')}</h3>
          {errors.extraFields && <p className="text-xs font-medium text-danger" role="alert">{err('extraFields')}</p>}
          <FieldListEditor value={form.extraFields} onChange={(v) => set('extraFields', v)} testIdPrefix="rt-cat-field" />
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-ink">{t('rt.cat.attachments')}</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={t('rt.cat.minAttachments')}>
              {(id) => <Input id={id} numeric value={String(form.minAttachments)} onChange={(e) => set('minAttachments', intOf(e.target.value, 0))} />}
            </FormField>
            <FormField label={t('rt.cat.maxAttachments')} error={err('maxAttachments')}>
              {(id) => <Input id={id} numeric value={String(form.maxAttachments)} invalid={!!errors.maxAttachments} onChange={(e) => set('maxAttachments', intOf(e.target.value, 0))} />}
            </FormField>
          </div>
          <div>
            <div className="mb-1.5 text-13 font-medium text-ink-2">{t('rt.cat.allowedTypes')}</div>
            <div className="flex flex-wrap gap-4">
              {ATTACHMENT_MIME_TYPES.map((m) => (
                <Checkbox key={m} label={MIME_LABELS[m]} checked={form.allowedMimeTypes.includes(m)} onChange={(on) => toggleMime(m, on)} />
              ))}
            </div>
            {errors.allowedMimeTypes && <p className="mt-1 text-xs font-medium text-danger" role="alert">{err('allowedMimeTypes')}</p>}
          </div>
        </section>
      </div>
    </Drawer>
  );
}
