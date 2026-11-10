'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowRight, ArrowUp, Eye, FileText, Plus, Save, Send, Upload } from 'lucide-react';
import { templateConfigSchema, type TemplateConfig } from '@dms/shared';
import { API_BASE, api, errorMessage, tokens } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDateTime } from '@/lib/format';
import { Badge, Card, ErrorBlock, LoadingBlock, PageHeader } from '@/components/ui/Display';
import { Button } from '@/components/ui/Button';
import { Checkbox, FormField, Input, Select } from '@/components/ui/Fields';
import { useToast } from '@/components/ui/Toast';
import { useTr } from '../common/useTr';
import type { TemplateDto, TemplateVersionDto } from '../types';

const vTone = { DRAFT: 'amber', ACTIVE: 'green', ARCHIVED: 'gray' } as const;

const BASE_COLUMNS = ['category', 'originalAmount', 'amount', 'quantity', 'unitPrice', 'note'] as const;
const KNOWN_HEADER = ['requestNumber', 'submittedAt', 'submitterName', 'vehicleNumber', 'vehicleType', 'costCenter', 'odometer'];

const DEFAULT_CONFIG: TemplateConfig = {
  titleAr: 'كشف مصاريف',
  titleEn: 'Expense Sheet',
  headerFields: KNOWN_HEADER.map((k) => ({ key: k, labelAr: k, show: true })),
  lineColumns: BASE_COLUMNS.map((k) => ({ key: k, labelAr: k, show: true })),
  showOriginalValues: true,
  showAmountInWords: true,
  signature: { perRow: 4, showDateTime: true, submitterLabelAr: 'السائق' },
};

/** POST that returns text/blob (preview endpoints answer HTML/PDF, not JSON). Retries once after a token refresh. */
async function postRaw(path: string, body: unknown): Promise<Response> {
  const exec = () => {
    const t = tokens.get();
    return fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(t?.accessToken ? { Authorization: `Bearer ${t.accessToken}` } : {}) },
      body: JSON.stringify(body),
    });
  };
  let res = await exec();
  if (res.status === 401) {
    try {
      await api.get('/auth/me'); // triggers the shared refresh flow
      res = await exec();
    } catch {
      /* fall through */
    }
  }
  if (!res.ok) {
    let msg = res.statusText;
    try {
      msg = ((await res.json()) as { error?: { message?: string } }).error?.message ?? msg;
    } catch {
      /* not json */
    }
    throw new Error(msg);
  }
  return res;
}

export function TemplateEditorPage({ id }: { id: string }) {
  const { t, locale } = useTr();
  const { can } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const canManage = can('templates.manage');

  const tpl = useQuery({ queryKey: ['template', id], queryFn: () => api.get<TemplateDto>(`/templates/${id}`) });
  const versions = useMemo(() => [...(tpl.data?.versions ?? [])].sort((a, b) => b.version - a.version), [tpl.data]);
  const [versionId, setVersionId] = useState('');
  useEffect(() => {
    if (!versionId && versions.length > 0) setVersionId((versions.find((v) => v.status === 'DRAFT') ?? versions.find((v) => v.status === 'ACTIVE') ?? versions[0]!).id);
  }, [versions, versionId]);
  const current: TemplateVersionDto | undefined = versions.find((v) => v.id === versionId);
  const readOnly = !canManage || current?.status !== 'DRAFT';

  const [cfg, setCfg] = useState<TemplateConfig>(DEFAULT_CONFIG);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (current) {
      const parsed = templateConfigSchema.safeParse(current.config);
      setCfg(parsed.success ? parsed.data : DEFAULT_CONFIG);
      setDirty(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, tpl.dataUpdatedAt]);

  const set = (patch: Partial<TemplateConfig>) => {
    setCfg((c) => ({ ...c, ...patch }));
    setDirty(true);
  };
  const check = templateConfigSchema.safeParse(cfg);

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ['template', id] });
    await qc.invalidateQueries({ queryKey: ['templates'] });
  };
  const save = useMutation({
    mutationFn: () => api.put(`/template-versions/${versionId}`, { config: cfg, layoutKey: current?.layoutKey }),
    onSuccess: async () => {
      toast.success(t('templates.saved'));
      await refresh();
    },
    onError: (e) => toast.error(e),
  });
  const publish = useMutation({
    mutationFn: async () => {
      await api.put(`/template-versions/${versionId}`, { config: cfg, layoutKey: current?.layoutKey });
      return api.post(`/template-versions/${versionId}/publish`);
    },
    onSuccess: async () => {
      toast.success(t('templates.published'));
      await refresh();
    },
    onError: (e) => toast.error(e),
  });
  const draft = useMutation({
    mutationFn: () => api.post<TemplateVersionDto>(`/templates/${id}/versions`, { basedOnVersionId: versionId || undefined }),
    onSuccess: async (v) => {
      toast.success(t('templates.draftCreated'));
      await refresh();
      if (v?.id) setVersionId(v.id);
    },
    onError: (e) => toast.error(e),
  });

  // ---- live preview (debounced) ----
  const [html, setHtml] = useState('');
  const [pvErr, setPvErr] = useState<string | null>(null);
  const [pvBusy, setPvBusy] = useState(false);
  const seq = useRef(0);
  useEffect(() => {
    if (!versionId || !check.success) return;
    const my = ++seq.current;
    const h = setTimeout(async () => {
      setPvBusy(true);
      try {
        const res = await postRaw(`/template-versions/${versionId}/preview?format=html`, { config: cfg });
        const text = await res.text();
        if (my === seq.current) {
          setHtml(text);
          setPvErr(null);
        }
      } catch (e) {
        if (my === seq.current) setPvErr(errorMessage(e));
      } finally {
        if (my === seq.current) setPvBusy(false);
      }
    }, 600);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versionId, JSON.stringify(cfg)]);

  const openPdf = async () => {
    try {
      const res = await postRaw(`/template-versions/${versionId}/preview?format=pdf`, { config: cfg });
      const url = URL.createObjectURL(await res.blob());
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      toast.error(e);
    }
  };

  const uploadLogo = async (file: File) => {
    try {
      const r = await api.upload<{ key: string; url: string }>('/templates/logo', file, file.name);
      set({ logoKey: r.key });
      toast.success(t('templates.logoUploaded'));
    } catch (e) {
      toast.error(e);
    }
  };

  if (tpl.isLoading) return <LoadingBlock />;
  if (tpl.isError || !tpl.data) return <ErrorBlock message={errorMessage(tpl.error)} />;

  const hasDraft = versions.some((v) => v.status === 'DRAFT');
  const moveIn = <K extends 'headerFields' | 'lineColumns'>(k: K, i: number, d: -1 | 1) => {
    const l = [...cfg[k]];
    const j = i + d;
    if (j < 0 || j >= l.length) return;
    [l[i], l[j]] = [l[j]!, l[i]!];
    set({ [k]: l } as Partial<TemplateConfig>);
  };
  const colLabel = (key: string) => (key.startsWith('extra.') ? key : t(`templates.col.${key}`));

  return (
    <div className="space-y-4">
      <Link href="/templates" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowRight className="h-4 w-4 rtl:rotate-0 ltr:rotate-180" aria-hidden /> {t('templates.back')}
      </Link>
      <PageHeader title={locale === 'ar' ? tpl.data.nameAr : tpl.data.nameEn || tpl.data.nameAr} subtitle={tpl.data.code} />

      <Card title={t('templates.versions')}>
        <div className="flex flex-wrap items-center gap-2">
          {versions.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => {
                if (dirty && !window.confirm(t('templates.discardChanges'))) return;
                setVersionId(v.id);
              }}
              className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${v.id === versionId ? 'border-brand-700 bg-brand-50 ring-1 ring-brand-700' : 'border-slate-300 bg-white hover:bg-slate-50'}`}
            >
              <b>v{v.version}</b>
              <Badge tone={vTone[v.status]}>{t(`workflows.status.${v.status}`)}</Badge>
              {v.publishedAt && <span className="text-xs text-slate-500">{formatDateTime(v.publishedAt)}</span>}
            </button>
          ))}
          {canManage && (
            <Button size="sm" variant="secondary" icon={<Plus className="h-4 w-4" />} disabled={hasDraft} loading={draft.isPending} onClick={() => draft.mutate()}>
              {t('templates.newDraft')}
            </Button>
          )}
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="space-y-4">
          {!readOnly && (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" icon={<Save className="h-4 w-4" />} loading={save.isPending} disabled={!dirty || !check.success} onClick={() => save.mutate()}>
                {t('common.save')}
              </Button>
              <Button icon={<Send className="h-4 w-4" />} loading={publish.isPending} disabled={!check.success} onClick={() => publish.mutate()}>
                {t('templates.publish')}
              </Button>
            </div>
          )}
          {!check.success && <ErrorBlock message={check.error.issues[0]?.path.join('.') + ': ' + check.error.issues[0]?.message} />}

          <Card title={t('templates.section.titles')}>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label={t('templates.titleAr')}>{(fid) => <Input id={fid} readOnly={readOnly} value={cfg.titleAr} onChange={(e) => set({ titleAr: e.target.value })} />}</FormField>
              <FormField label={t('templates.titleEn')}>{(fid) => <Input id={fid} dir="ltr" readOnly={readOnly} value={cfg.titleEn ?? ''} onChange={(e) => set({ titleEn: e.target.value })} />}</FormField>
              <FormField label={t('templates.companyName')}>{(fid) => <Input id={fid} readOnly={readOnly} value={cfg.companyNameAr ?? ''} onChange={(e) => set({ companyNameAr: e.target.value })} />}</FormField>
              <FormField label={t('templates.footerNote')}>{(fid) => <Input id={fid} readOnly={readOnly} value={cfg.footerNoteAr ?? ''} onChange={(e) => set({ footerNoteAr: e.target.value })} />}</FormField>
              <FormField label={t('templates.logo')} hint={cfg.logoKey ? t('templates.logoSet') : undefined}>
                {(fid) => (
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50">
                    <Upload className="h-4 w-4" />
                    {t('templates.uploadLogo')}
                    <input id={fid} type="file" accept="image/png,image/jpeg" className="sr-only" disabled={readOnly} onChange={(e) => e.target.files?.[0] && void uploadLogo(e.target.files[0])} />
                  </label>
                )}
              </FormField>
            </div>
          </Card>

          <Card title={t('templates.section.header')}>
            <ul className="space-y-2">
              {cfg.headerFields.map((f, i) => (
                <li key={f.key} className="flex flex-wrap items-center gap-2">
                  <Checkbox disabled={readOnly} checked={f.show} onChange={(v) => set({ headerFields: cfg.headerFields.map((x, j) => (j === i ? { ...x, show: v } : x)) })} />
                  <code className="w-32 text-xs text-slate-500" dir="ltr">{f.key}</code>
                  <Input className="h-9 flex-1 min-w-[8rem]" readOnly={readOnly} value={f.labelAr} onChange={(e) => set({ headerFields: cfg.headerFields.map((x, j) => (j === i ? { ...x, labelAr: e.target.value } : x)) })} />
                  {!readOnly && <Mover onUp={() => moveIn('headerFields', i, -1)} onDown={() => moveIn('headerFields', i, 1)} first={i === 0} last={i === cfg.headerFields.length - 1} />}
                </li>
              ))}
            </ul>
          </Card>

          <Card title={t('templates.section.columns')}>
            <ul className="space-y-2">
              {cfg.lineColumns.map((c, i) => (
                <li key={String(c.key)} className="flex flex-wrap items-center gap-2">
                  <Checkbox disabled={readOnly} checked={c.show} onChange={(v) => set({ lineColumns: cfg.lineColumns.map((x, j) => (j === i ? { ...x, show: v } : x)) })} />
                  <span className="w-32 text-xs text-slate-500">{colLabel(String(c.key))}</span>
                  <Input className="h-9 flex-1 min-w-[8rem]" readOnly={readOnly} value={c.labelAr} onChange={(e) => set({ lineColumns: cfg.lineColumns.map((x, j) => (j === i ? { ...x, labelAr: e.target.value } : x)) })} />
                  {!readOnly && <Mover onUp={() => moveIn('lineColumns', i, -1)} onDown={() => moveIn('lineColumns', i, 1)} first={i === 0} last={i === cfg.lineColumns.length - 1} />}
                </li>
              ))}
            </ul>
          </Card>

          <Card title={t('templates.section.options')}>
            <div className="space-y-3">
              <Checkbox disabled={readOnly} checked={cfg.showOriginalValues} onChange={(v) => set({ showOriginalValues: v })} label={t('templates.showOriginal')} />
              <Checkbox disabled={readOnly} checked={cfg.showAmountInWords} onChange={(v) => set({ showAmountInWords: v })} label={t('templates.showWords')} />
              <div className="grid gap-3 sm:grid-cols-3">
                <FormField label={t('templates.sigPerRow')}>
                  {(fid) => (
                    <Select
                      id={fid}
                      disabled={readOnly}
                      value={String(cfg.signature.perRow)}
                      onChange={(v) => set({ signature: { ...cfg.signature, perRow: Number(v) } })}
                      options={[1, 2, 3, 4, 5, 6, 8].map((n) => ({ value: String(n), label: String(n) }))}
                    />
                  )}
                </FormField>
                <FormField label={t('templates.submitterLabel')}>
                  {(fid) => <Input id={fid} readOnly={readOnly} value={cfg.signature.submitterLabelAr} onChange={(e) => set({ signature: { ...cfg.signature, submitterLabelAr: e.target.value } })} />}
                </FormField>
                <div className="flex items-end pb-2">
                  <Checkbox disabled={readOnly} checked={cfg.signature.showDateTime} onChange={(v) => set({ signature: { ...cfg.signature, showDateTime: v } })} label={t('templates.sigDateTime')} />
                </div>
              </div>
              <p className="text-xs text-slate-500">{t('templates.sigAutoHint')}</p>
            </div>
          </Card>
        </div>

        <div className="xl:sticky xl:top-4 xl:self-start">
          <Card
            title={t('templates.preview')}
            actions={
              <Button size="sm" variant="secondary" icon={<FileText className="h-4 w-4" />} disabled={!check.success} onClick={() => void openPdf()}>
                {t('templates.previewPdf')}
              </Button>
            }
            padded={false}
          >
            {pvErr && <div className="p-3"><ErrorBlock message={pvErr} /></div>}
            <div className="relative">
              {pvBusy && <span className="absolute end-2 top-2 z-10 rounded bg-white/90 px-2 py-0.5 text-xs text-slate-500"><Eye className="inline h-3 w-3" /> …</span>}
              <iframe title={t('templates.preview')} sandbox="" srcDoc={html} className="h-[70vh] w-full rounded-b-xl bg-white" />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Mover({ onUp, onDown, first, last }: { onUp: () => void; onDown: () => void; first: boolean; last: boolean }) {
  return (
    <span className="flex">
      <Button size="sm" variant="ghost" disabled={first} onClick={onUp} icon={<ArrowUp className="h-4 w-4" />} aria-label="up" />
      <Button size="sm" variant="ghost" disabled={last} onClick={onDown} icon={<ArrowDown className="h-4 w-4" />} aria-label="down" />
    </span>
  );
}
