'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { Banner, Button, Card, Checkbox, ErrorBlock, FormField, Icon, IconButton, Input, Page, PageHeader, Select, SkeletonCard, useToast } from '@/components/ui';

interface SettingRow {
  key: string;
  value: unknown;
}
interface CashJournal {
  defaultNumber: string;
  businessTransaction: string;
  numberByTreasuryCode: Record<string, string>;
}
interface SapConfig {
  companyCode: string;
  documentType: string;
  currency: string;
  debitPostingKey: string;
  creditPostingKey: string;
  aggregateSameGlCostCenter: boolean;
  documentDateMode: string;
  cashJournal: CashJournal;
}

const FALLBACK: SapConfig = {
  companyCode: '1000',
  documentType: 'SA',
  currency: 'EGP',
  debitPostingKey: '40',
  creditPostingKey: '50',
  aggregateSameGlCostCenter: false,
  documentDateMode: 'PAYMENT_DATE',
  cashJournal: { defaultNumber: '0001', businessTransaction: '', numberByTreasuryCode: {} },
};

export default function SapSettingsPage() {
  const { t } = useT();
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['settings'], queryFn: () => api.get<SettingRow[]>('/settings') });
  const [form, setForm] = useState<SapConfig>(FALLBACK);
  /** treasury code -> cash journal number, edited as rows */
  const [map, setMap] = useState<[string, string][]>([]);

  useEffect(() => {
    const row = q.data?.find((r) => r.key === 'sap.config');
    if (row) {
      const v = row.value as Partial<SapConfig>;
      setForm({ ...FALLBACK, ...v, cashJournal: { ...FALLBACK.cashJournal, ...(v.cashJournal ?? {}) } });
      setMap(Object.entries(v.cashJournal?.numberByTreasuryCode ?? {}));
    }
  }, [q.data]);

  const save = useMutation({
    mutationFn: () => {
      const numberByTreasuryCode = Object.fromEntries(map.filter(([k, v]) => k.trim() && v.trim()).map(([k, v]) => [k.trim(), v.trim()]));
      return api.put('/settings/sap.config', { value: { ...form, cashJournal: { ...form.cashJournal, numberByTreasuryCode } } });
    },
    onSuccess: () => {
      toast.success(t('common.saved'));
      void qc.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (e) => toast.error(e),
  });

  const set = <K extends keyof SapConfig>(k: K, v: SapConfig[K]) => setForm((f) => ({ ...f, [k]: v }));
  const setCj = <K extends keyof CashJournal>(k: K, v: CashJournal[K]) => setForm((f) => ({ ...f, cashJournal: { ...f.cashJournal, [k]: v } }));

  if (q.isLoading) return <SkeletonCard lines={8} />;
  if (q.error) return <ErrorBlock message={errorMessage(q.error)} onRetry={() => void q.refetch()} />;

  return (
    <Page testId="page-sap-settings" width="narrow">
      <PageHeader title={t('master.sapSettings.title')} subtitle={t('master.sapSettings.subtitle')} />
      <form
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Card>
          <div className="grid gap-4 sm:grid-cols-2">
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
          </div>
        </Card>

        <Card title={t('master.sapSettings.cj.title')} subtitle={t('master.sapSettings.cj.subtitle')}>
          <div className="space-y-4" data-testid="sap-cash-journal">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label={t('master.sapSettings.cj.defaultNumber')} required>
                {(id) => <Input id={id} dir="ltr" data-testid="cj-default" value={form.cashJournal.defaultNumber} onChange={(e) => setCj('defaultNumber', e.target.value)} />}
              </FormField>
              <FormField label={t('master.sapSettings.cj.businessTransaction')} hint={t('master.sapSettings.cj.businessTransactionHint')}>
                {(id) => <Input id={id} dir="ltr" data-testid="cj-bt" value={form.cashJournal.businessTransaction} onChange={(e) => setCj('businessTransaction', e.target.value)} />}
              </FormField>
            </div>
            <div>
              <p className="text-sm font-medium text-ink">{t('master.sapSettings.cj.mapping')}</p>
              <p className="mb-2 text-xs text-ink-3">{t('master.sapSettings.cj.mappingHint')}</p>
              <div className="space-y-2" data-testid="cj-map">
                {map.map(([code, num], i) => (
                  <div key={i} className="flex items-center gap-2" data-testid="cj-map-row">
                    <Input
                      dir="ltr"
                      className="flex-1"
                      aria-label={t('master.sapSettings.cj.treasuryCode')}
                      placeholder={t('master.sapSettings.cj.treasuryCode')}
                      value={code}
                      onChange={(e) => setMap((m) => m.map((r, j): [string, string] => (j === i ? [e.target.value, r[1]] : r)))}
                    />
                    <Input
                      dir="ltr"
                      className="flex-1"
                      aria-label={t('master.sapSettings.cj.number')}
                      placeholder={t('master.sapSettings.cj.number')}
                      value={num}
                      onChange={(e) => setMap((m) => m.map((r, j): [string, string] => (j === i ? [r[0], e.target.value] : r)))}
                    />
                    <IconButton icon={<Icon as={Trash2} size={16} />} label={t('common.delete')} onClick={() => setMap((m) => m.filter((_, j) => j !== i))} />
                  </div>
                ))}
              </div>
              <Button type="button" variant="secondary" size="sm" className="mt-2" icon={<Icon as={Plus} size={16} />} data-testid="cj-map-add" onClick={() => setMap((m) => [...m, ['', '']])}>
                {t('master.sapSettings.cj.addRow')}
              </Button>
            </div>
          </div>
        </Card>

        <Banner tone="warning">{t('master.sapSettings.placeholderNote')}</Banner>
        <div className="sticky bottom-4 z-sticky flex justify-end rounded-lg border border-hairline bg-surface p-3 shadow-pop">
          <Button type="submit" loading={save.isPending} data-testid="sap-settings-save">
            {t('common.save')}
          </Button>
        </div>
      </form>
    </Page>
  );
}
