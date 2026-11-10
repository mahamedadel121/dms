'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { formatDateTime } from '@/lib/format';
import { Button, Card, Checkbox, ErrorBlock, Input, LoadingBlock, PageHeader, Textarea, useToast } from '@/components/ui';

interface SettingRow {
  key: string;
  value: unknown;
  updatedAt: string | null;
}

/** Local edit state is a string for text/number/json, boolean for flags. */
function initialDraft(v: unknown): string | boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  return JSON.stringify(v, null, 2);
}

function SettingEditor({ row }: { row: SettingRow }) {
  const { t } = useT();
  const toast = useToast();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<string | boolean>(() => initialDraft(row.value));
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => {
      let value: unknown;
      if (typeof row.value === 'boolean') value = Boolean(draft);
      else if (typeof row.value === 'number') {
        value = Number(draft);
        if (String(draft).trim() === '' || Number.isNaN(value)) throw new Error(t('common.invalidNumber'));
      } else if (typeof row.value === 'string') value = String(draft);
      else {
        try {
          value = JSON.parse(String(draft));
        } catch {
          throw new Error(t('admin.settings.invalidJson'));
        }
      }
      return api.put(`/settings/${row.key}`, { value });
    },
    onSuccess: () => {
      setError(null);
      toast.success(t('admin.settings.saved'));
      void qc.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (e) => {
      setError(errorMessage(e));
    },
  });

  const label = t(`admin.settings.k.${row.key}`);
  const isObject = typeof row.value === 'object' && row.value !== null;
  const dirty = draft !== initialDraft(row.value);

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-900">{label === `admin.settings.k.${row.key}` ? row.key : label}</p>
          <p className="text-xs text-slate-400" dir="ltr">{row.key}</p>
          {row.updatedAt && <p className="text-xs text-slate-400">{t('admin.settings.updated')}: {formatDateTime(row.updatedAt)}</p>}
        </div>
        <div className="w-full sm:w-80">
          {typeof row.value === 'boolean' ? (
            <Checkbox checked={Boolean(draft)} label={t(draft ? 'common.yes' : 'common.no')} onChange={setDraft} />
          ) : isObject ? (
            <Textarea dir="ltr" rows={6} className="font-mono text-xs" value={String(draft)} onChange={(e) => setDraft(e.target.value)} />
          ) : (
            <Input dir="ltr" type={typeof row.value === 'number' ? 'number' : 'text'} value={String(draft)} onChange={(e) => setDraft(e.target.value)} />
          )}
          {error && <p className="mt-1 text-xs font-medium text-red-600">{error}</p>}
          <Button className="mt-2" size="sm" disabled={!dirty} loading={save.isPending} onClick={() => save.mutate()}>
            {t('common.save')}
          </Button>
        </div>
      </div>
    </Card>
  );
}

export default function SettingsPage() {
  const { t } = useT();
  const q = useQuery({ queryKey: ['settings'], queryFn: () => api.get<SettingRow[]>('/settings') });
  return (
    <>
      <PageHeader title={t('admin.settings.title')} subtitle={t('admin.settings.subtitle')} />
      {q.isLoading && <LoadingBlock />}
      {q.error && <ErrorBlock message={errorMessage(q.error)} />}
      <div className="space-y-3">
        {q.data?.map((r) => (
          <SettingEditor key={`${r.key}:${r.updatedAt}`} row={r} />
        ))}
      </div>
    </>
  );
}
