'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { Button, Card, Checkbox, Code, DateText, ErrorBlock, Input, Page, PageHeader, SkeletonCard, Switch, Textarea, useToast } from '@/components/ui';

interface SettingRow {
  key: string;
  value: unknown;
  updatedAt: string | null;
}

interface NotifValue {
  enabled: boolean;
  types: string[];
}

const NOTIF_TYPES = ['REQ_AT_STEP', 'SLA_REMINDER', 'CORRECTION_RETURNED', 'STEP_SENT_BACK', 'SAP_FAILED', 'VEHICLE_CHANGE_REQUESTED', 'EXPORT_READY'];
const NOTIF_KEYS = new Set(['notifications.email', 'notifications.telegramUsers']);
const GROUPS = ['workflow', 'bot', 'expense', 'media', 'files', 'reports', 'company', 'sap', 'notifications'];

type Draft = string | boolean | NotifValue;

/** Local edit state is a string for text/number/json, boolean for flags, an object for the notification editors. */
function initialDraft(key: string, v: unknown): Draft {
  if (NOTIF_KEYS.has(key)) {
    const o = (v ?? {}) as Partial<NotifValue>;
    return { enabled: o.enabled === true, types: Array.isArray(o.types) ? [...o.types] : [] };
  }
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  return JSON.stringify(v, null, 2);
}

const sameDraft = (a: Draft, b: Draft) => JSON.stringify(a) === JSON.stringify(b);

function SettingRowEditor({ row }: { row: SettingRow }) {
  const { t } = useT();
  const toast = useToast();
  const qc = useQueryClient();
  const initial = initialDraft(row.key, row.value);
  const [draft, setDraft] = useState<Draft>(initial);
  const [error, setError] = useState<string | null>(null);
  const isNotif = NOTIF_KEYS.has(row.key);

  const save = useMutation({
    mutationFn: () => {
      let value: unknown;
      if (isNotif) value = draft;
      else if (typeof row.value === 'boolean') value = Boolean(draft);
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
    onError: (e) => setError(errorMessage(e)),
  });

  const labelKey = `admin.settings.k.${row.key}`;
  const label = t(labelKey) === labelKey ? row.key : t(labelKey);
  const dirty = !sameDraft(draft, initial);

  let control: ReactNode;
  if (isNotif) {
    const v = draft as NotifValue;
    control = (
      <div className="space-y-3">
        <Switch checked={v.enabled} onChange={(enabled) => setDraft({ ...v, enabled })} label={t('admin.settings.notifEnabled')} />
        <fieldset className="space-y-2" disabled={!v.enabled}>
          <legend className="mb-1 text-xs text-ink-3">{t('admin.settings.notifTypes')}</legend>
          {NOTIF_TYPES.map((ty) => (
            <div key={ty}>
              <Checkbox
                label={t(`admin.notifType.${ty}`)}
                checked={v.types.includes(ty)}
                disabled={!v.enabled}
                onChange={(on) => setDraft({ ...v, types: on ? [...v.types, ty] : v.types.filter((x) => x !== ty) })}
              />
            </div>
          ))}
        </fieldset>
      </div>
    );
  } else if (typeof row.value === 'boolean') {
    control = <Switch checked={Boolean(draft)} onChange={setDraft} label={t(draft ? 'common.yes' : 'common.no')} />;
  } else if (typeof row.value === 'object' && row.value !== null) {
    control = <Textarea dir="ltr" rows={6} className="code text-xs" value={String(draft)} onChange={(e) => setDraft(e.target.value)} />;
  } else if (typeof row.value === 'number') {
    control = <Input numeric value={String(draft)} onChange={(e) => setDraft(e.target.value)} />;
  } else {
    control = <Input dir="ltr" value={String(draft)} onChange={(e) => setDraft(e.target.value)} />;
  }

  return (
    <div className="flex flex-wrap items-start justify-between gap-3 py-4 first:pt-0 last:pb-0" data-testid={`setting-${row.key}`}>
      <div className="min-w-0 flex-1 basis-56">
        <p className="text-sm font-medium text-ink">{label}</p>
        <Code className="text-[11px] text-ink-3">{row.key}</Code>
        {row.updatedAt && (
          <p className="mt-0.5 text-xs text-ink-3">
            {t('admin.settings.updated')}: <DateText value={row.updatedAt} mode="dayTime" />
          </p>
        )}
      </div>
      <div className="w-full sm:w-80">
        {control}
        {error && <p role="alert" className="mt-1 text-xs font-medium text-danger">{error}</p>}
        {dirty && (
          <Button className="mt-2" size="sm" loading={save.isPending} onClick={() => save.mutate()}>
            {t('common.save')}
          </Button>
        )}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { t } = useT();
  const q = useQuery({ queryKey: ['settings'], queryFn: () => api.get<SettingRow[]>('/settings') });

  const grouped = useMemo(() => {
    const map = new Map<string, SettingRow[]>();
    for (const r of q.data ?? []) {
      const prefix = r.key.split('.')[0]!;
      const g = GROUPS.includes(prefix) ? prefix : 'other';
      (map.get(g) ?? map.set(g, []).get(g)!).push(r);
    }
    return [...GROUPS, 'other'].filter((g) => map.has(g)).map((g) => [g, map.get(g)!] as const);
  }, [q.data]);

  return (
    <Page testId="page-admin-settings" width="narrow">
      <PageHeader title={t('admin.settings.title')} subtitle={t('admin.settings.subtitle')} />
      {q.isLoading && <SkeletonCard lines={5} />}
      {q.error && <ErrorBlock message={errorMessage(q.error)} onRetry={() => void q.refetch()} />}
      {grouped.map(([g, rows]) => (
        <Card key={g} title={t(`admin.settings.group.${g}`)}>
          <div className="divide-y divide-hairline">
            {rows.map((r) => (
              <SettingRowEditor key={`${r.key}:${r.updatedAt}`} row={r} />
            ))}
          </div>
        </Card>
      ))}
    </Page>
  );
}
