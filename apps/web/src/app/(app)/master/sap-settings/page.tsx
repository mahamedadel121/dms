'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { Button, Card, Checkbox, ErrorBlock, FormField, Input, LoadingBlock, PageHeader, Select, useToast } from '@/components/ui';
import { errorMessage } from '@/lib/api';

interface SettingRow {
  key: string;
  value: unknown;
}
interface SapConfig {
  companyCode: string;
  documentType: string;
  currency: string;
  debitPostingKey: string;
  creditPostingKey: string;
  aggregateSameGlCostCenter: boolean;
  documentDateMode: string;
}

const FALLBACK: SapConfig = {
  companyCode: '1000',
  documentType: 'SA',
  currency: 'EGP',
  debitPostingKey: '40',
  creditPostingKey: '50',
  aggregateSameGlCostCenter: false,
  documentDateMode: 'PAYMENT_DATE',
};

export default function SapSettingsPage() {
  const { t } = useT();
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['settings'], queryFn: () => api.get<SettingRow[]>('/settings') });
  const [form, setForm] = useState<SapConfig>(FALLBACK);

  useEffect(() => {
    const row = q.data?.find((r) => r.key === 'sap.config');
    if (row) setForm({ ...FALLBACK, ...(row.value as Partial<SapConfig>) });
  }, [q.data]);

  const save = useMutation({
    mutationFn: () => api.put('/settings/sap.config', { value: form }),
    onSuccess: () => {
      toast.success(t('common.saved'));
      void qc.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (e) => toast.error(e),
  });

  const set = <K extends keyof SapConfig>(k: K, v: SapConfig[K]) => setForm((f) => ({ ...f, [k]: v }));

  if (q.isLoading) return <LoadingBlock />;
  if (q.error) return <ErrorBlock message={errorMessage(q.error)} />;

  return (
    <>
      <PageHeader title={t('master.sapSettings.title')} subtitle={t('master.sapSettings.subtitle')} />
      <Card>
        <form
          className="grid max-w-3xl gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <FormField label={t('master.sapSettings.companyCode')} required>{(id) => <Input id={id} dir="ltr" value={form.companyCode} onChange={(e) => set('companyCode', e.target.value)} />}</FormField>
          <FormField label={t('master.sapSettings.documentType')} required>{(id) => <Input id={id} dir="ltr" value={form.documentType} onChange={(e) => set('documentType', e.target.value)} />}</FormField>
          <FormField label={t('master.sapSettings.currency')} required>{(id) => <Input id={id} dir="ltr" value={form.currency} onChange={(e) => set('currency', e.target.value)} />}</FormField>
          <FormField label={t('master.sapSettings.documentDateMode')}>
            {(id) => (
              <Select
                id={id}
                value={form.documentDateMode}
                options={['PAYMENT_DATE', 'SUBMISSION_DATE'].map((m) => ({ value: m, label: t(`master.sapSettings.mode.${m}`) }))}
                onChange={(v) => set('documentDateMode', v)}
              />
            )}
          </FormField>
          <FormField label={t('master.sapSettings.debitPostingKey')} required>{(id) => <Input id={id} dir="ltr" value={form.debitPostingKey} onChange={(e) => set('debitPostingKey', e.target.value)} />}</FormField>
          <FormField label={t('master.sapSettings.creditPostingKey')} required>{(id) => <Input id={id} dir="ltr" value={form.creditPostingKey} onChange={(e) => set('creditPostingKey', e.target.value)} />}</FormField>
          <div className="sm:col-span-2">
            <Checkbox label={t('master.sapSettings.aggregate')} checked={form.aggregateSameGlCostCenter} onChange={(c) => set('aggregateSameGlCostCenter', c)} />
          </div>
          <p className="text-xs text-amber-700 sm:col-span-2">{t('master.sapSettings.placeholderNote')}</p>
          <div className="sm:col-span-2">
            <Button type="submit" loading={save.isPending}>
              {t('common.save')}
            </Button>
          </div>
        </form>
      </Card>
    </>
  );
}
