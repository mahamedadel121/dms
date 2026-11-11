'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, ChevronDown, FileText, Plus, RefreshCw, Save, Send } from 'lucide-react';
import { templateConfigSchema, type TemplateConfig } from '@dms/shared';
import { API_BASE, api, errorMessage, openBlobInNewTab, tokens } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Banner, Button, Card, Checkbox, Code, DateText, ErrorBlock, FileDrop, FormField, Icon, IconButton, Input, LoadingBlock, Page, PageHeader, SegmentedControl, Select, StatusChip, Switch, useToast } from '@/components/ui';
import { useTr } from '../common/useTr';
import type { TemplateDto, TemplateVersionDto } from '../types';

const A4_WIDTH = 794;

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
  const [layoutKey, setLayoutKey] = useState('generic-request');
  useEffect(() => {
    if (current) {
      const parsed = templateConfigSchema.safeParse(current.config);
      setCfg(parsed.success ? parsed.data : DEFAULT_CONFIG);
      setLayoutKey(current.layoutKey);
      setDirty(false);
    }
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
    mutationFn: () => api.put(`/template-versions/${versionId}`, { config: cfg, layoutKey }),
    onSuccess: async () => {
      toast.success(t('templates.saved'));
      await refresh();
    },
    onError: (e) => toast.error(e),
  });
  const publish = useMutation({
    mutationFn: async () => {
      await api.put(`/template-versions/${versionId}`, { config: cfg, layoutKey });
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
  const [reload, setReload] = useState(0);
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
  }, [versionId, JSON.stringify(cfg), reload]);

  const openPdf = async () => {
    try {
      await openBlobInNewTab(
        async () => (await postRaw(`/template-versions/${versionId}/preview?format=pdf`, { config: cfg })).blob(),
        'template-preview.pdf',
      );
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

  // ---- identity (names PATCH on blur, flags PATCH on toggle) ----
  const [nameAr, setNameAr] = useState('');
  const [nameEn, setNameEn] = useState('');
  useEffect(() => {
    if (tpl.data) {
      setNameAr(tpl.data.nameAr);
      setNameEn(tpl.data.nameEn);
    }
  }, [tpl.data?.nameAr, tpl.data?.nameEn]);
  const meta = useMutation({
    mutationFn: (body: { nameAr?: string; nameEn?: string; isDefault?: boolean; isActive?: boolean }) => api.patch(`/templates/${id}`, body),
    onSuccess: async () => {
      toast.success(t('templates.metaSaved'));
      await qc.invalidateQueries({ queryKey: ['template', id] });
      await qc.invalidateQueries({ queryKey: ['templates'] });
    },
    onError: (e) => toast.error(e),
  });
  const saveName = (field: 'nameAr' | 'nameEn', value: string) => {
    const v = value.trim();
    if (!tpl.data || !v || v === tpl.data[field]) return;
    meta.mutate({ [field]: v });
  };

  // ---- scaled A4 preview ----
  const boxRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  const [showPreview, setShowPreview] = useState(false);
  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      if (el.clientWidth > 0) setScale(el.clientWidth / A4_WIDTH);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [tpl.isLoading, showPreview]);

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
  const tname = (x: { nameAr: string; nameEn: string }) => (locale === 'ar' ? x.nameAr : x.nameEn || x.nameAr);

  const previewCard = (
    <Card
      title={t('templates.preview')}
      padded={false}
      actions={
        <div className="flex items-center gap-1">
          <IconButton icon={<Icon as={RefreshCw} size={16} />} label={t('templates.refresh')} data-testid="tpl-preview-refresh" onClick={() => setReload((n) => n + 1)} />
          <Button size="sm" variant="secondary" icon={<Icon as={FileText} size={16} />} disabled={!check.success} onClick={() => void openPdf()}>
            {t('templates.previewPdf')}
          </Button>
        </div>
      }
    >
      {pvErr && (
        <div className="p-3">
          <ErrorBlock message={pvErr} />
        </div>
      )}
      <div className="p-3">
        <div ref={boxRef} dir="ltr" className="relative aspect-[210/297] w-full overflow-hidden rounded border border-hairline bg-white">
          <iframe
            title={t('templates.preview')}
            data-testid="tpl-preview-frame"
            sandbox=""
            srcDoc={html}
            style={{ width: A4_WIDTH, height: Math.round((A4_WIDTH * 297) / 210), transform: `scale(${scale})`, transformOrigin: 'top left', left: 0, top: 0 }}
            className={`absolute border-0 bg-white ${pvBusy ? 'opacity-70' : ''}`}
          />
        </div>
      </div>
    </Card>
  );

  return (
    <Page testId="page-template-editor" width="wide" className="pb-4">
      <PageHeader back={{ href: '/templates', label: t('templates.back') }} title={tname(tpl.data)} subtitle={<Code>{tpl.data.code}</Code>} />

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
              className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${v.id === versionId ? 'border-primary bg-primary-tint ring-1 ring-primary' : 'border-line bg-surface hover:bg-surface-2'}`}
            >
              <b className="num">v{v.version}</b>
              <StatusChip kind="version" status={v.status} size="sm" label={t(`workflows.status.${v.status}`)} />
              {v.publishedAt && <DateText value={v.publishedAt} className="text-xs text-ink-3" />}
            </button>
          ))}
        </div>
        {current && current.status !== 'DRAFT' && (
          <Banner tone="info" className="mt-3">
            {t('workflows.readOnlyHint')}
          </Banner>
        )}
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(420px,5fr)]">
        <div className="space-y-6 max-xl:order-2">
          <Card title={t('templates.section.identity')}>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label={t('templates.create.nameAr')}>
                {(fid) => <Input id={fid} data-testid="tpl-meta-name-ar" disabled={!canManage} value={nameAr} onChange={(e) => setNameAr(e.target.value)} onBlur={() => saveName('nameAr', nameAr)} />}
              </FormField>
              <FormField label={t('templates.create.nameEn')}>
                {(fid) => <Input id={fid} dir="ltr" data-testid="tpl-meta-name-en" disabled={!canManage} value={nameEn} onChange={(e) => setNameEn(e.target.value)} onBlur={() => saveName('nameEn', nameEn)} />}
              </FormField>
            </div>
            <div className="mt-4 flex flex-wrap gap-6">
              <Switch checked={tpl.data.isDefault} disabled={!canManage || tpl.data.isDefault} onChange={(v) => meta.mutate({ isDefault: v })} label={t('templates.default')} />
              <Switch checked={tpl.data.isActive} disabled={!canManage || (tpl.data.isDefault && tpl.data.isActive)} onChange={(v) => meta.mutate({ isActive: v })} label={t('templates.active')} />
            </div>
          </Card>

          <Card title={t('templates.section.titles')}>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label={t('templates.titleAr')}>{(fid) => <Input id={fid} readOnly={readOnly} value={cfg.titleAr} onChange={(e) => set({ titleAr: e.target.value })} />}</FormField>
              <FormField label={t('templates.titleEn')}>{(fid) => <Input id={fid} dir="ltr" readOnly={readOnly} value={cfg.titleEn ?? ''} onChange={(e) => set({ titleEn: e.target.value })} />}</FormField>
              <FormField label={t('templates.companyName')}>{(fid) => <Input id={fid} readOnly={readOnly} value={cfg.companyNameAr ?? ''} onChange={(e) => set({ companyNameAr: e.target.value })} />}</FormField>
              <FormField label={t('templates.footerNote')}>{(fid) => <Input id={fid} readOnly={readOnly} value={cfg.footerNoteAr ?? ''} onChange={(e) => set({ footerNoteAr: e.target.value })} />}</FormField>
            </div>
            <div className="mt-4">
              <FormField label={t('templates.logo')} hint={cfg.logoKey ? t('templates.logoSet') : undefined}>
                <FileDrop accept="image/png,image/jpeg" disabled={readOnly} label={t('templates.uploadLogo')} onFile={(f) => void uploadLogo(f)} />
              </FormField>
            </div>
          </Card>

          <Card title={t('templates.layout.pick')}>
            <SegmentedControl
              size="md"
              ariaLabel={t('templates.layout.pick')}
              value={layoutKey}
              onChange={(v) => {
                if (readOnly) return;
                setLayoutKey(v);
                setDirty(true);
              }}
              items={[
                { value: 'expense-sheet', label: t('templates.layout.expense'), testId: 'tpl-layout-expense' },
                { value: 'generic-request', label: t('templates.layout.generic'), testId: 'tpl-layout-generic' },
              ]}
            />
          </Card>

          <Card title={t('templates.section.header')}>
            <ul className="space-y-2">
              {cfg.headerFields.map((f, i) => (
                <li key={f.key} className="flex flex-wrap items-center gap-2">
                  <Switch checked={f.show} disabled={readOnly} onChange={(v) => set({ headerFields: cfg.headerFields.map((x, j) => (j === i ? { ...x, show: v } : x)) })} />
                  <Input className="h-9 min-w-[8rem] flex-1" aria-label={t('templates.field.label')} readOnly={readOnly} value={f.labelAr} onChange={(e) => set({ headerFields: cfg.headerFields.map((x, j) => (j === i ? { ...x, labelAr: e.target.value } : x)) })} />
                  <Code className="w-32 text-xs text-ink-3">{f.key}</Code>
                  {!readOnly && <Mover onUp={() => moveIn('headerFields', i, -1)} onDown={() => moveIn('headerFields', i, 1)} first={i === 0} last={i === cfg.headerFields.length - 1} />}
                </li>
              ))}
            </ul>
          </Card>

          <Card title={t('templates.section.columns')}>
            <ul className="space-y-2">
              {cfg.lineColumns.map((c, i) => (
                <li key={String(c.key)} className="flex flex-wrap items-center gap-2">
                  <Switch checked={c.show} disabled={readOnly} onChange={(v) => set({ lineColumns: cfg.lineColumns.map((x, j) => (j === i ? { ...x, show: v } : x)) })} />
                  <Input className="h-9 min-w-[8rem] flex-1" aria-label={t('templates.field.label')} readOnly={readOnly} value={c.labelAr} onChange={(e) => set({ lineColumns: cfg.lineColumns.map((x, j) => (j === i ? { ...x, labelAr: e.target.value } : x)) })} />
                  <span className="w-32 text-xs text-ink-3">{colLabel(String(c.key))}</span>
                  {!readOnly && <Mover onUp={() => moveIn('lineColumns', i, -1)} onDown={() => moveIn('lineColumns', i, 1)} first={i === 0} last={i === cfg.lineColumns.length - 1} />}
                </li>
              ))}
            </ul>
          </Card>

          <Card title={t('templates.section.options')}>
            <div className="space-y-3">
              <Checkbox disabled={readOnly} checked={cfg.showOriginalValues} onChange={(v) => set({ showOriginalValues: v })} label={t('templates.showOriginal')} />
              <Checkbox disabled={readOnly} checked={cfg.showAmountInWords} onChange={(v) => set({ showAmountInWords: v })} label={t('templates.showWords')} />
              <div className="grid gap-4 sm:grid-cols-3">
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
              <p className="text-xs text-ink-3">{t('templates.sigAutoHint')}</p>
              {!check.success && <ErrorBlock message={`${check.error.issues[0]?.path.join('.')}: ${check.error.issues[0]?.message}`} />}
            </div>
          </Card>
        </div>

        <div className="max-xl:order-1 xl:sticky xl:top-[84px] xl:self-start">
          <div className="mb-3 xl:hidden">
            <Button variant="secondary" block icon={<Icon as={ChevronDown} size={16} className={showPreview ? 'rotate-180' : ''} />} onClick={() => setShowPreview((o) => !o)}>
              {t('templates.previewToggle')}
            </Button>
          </div>
          <div className={showPreview ? '' : 'max-xl:hidden'}>{previewCard}</div>
        </div>
      </div>

      <div className="sticky bottom-0 z-bar -mx-4 flex flex-wrap items-center gap-3 border-t border-hairline bg-surface px-4 py-3 sm:mx-0 sm:rounded-lg sm:border" data-testid="tpl-footer">
        {current && <StatusChip kind="version" status={current.status} label={`v${current.version} ${t(`workflows.status.${current.status}`)}`} />}
        {dirty && <span className="text-sm text-warning">{t('templates.unsaved')}</span>}
        <div className="ms-auto flex flex-wrap gap-2">
          {canManage && (
            <Button variant="ghost" icon={<Icon as={Plus} size={16} />} disabled={hasDraft} loading={draft.isPending} onClick={() => draft.mutate()}>
              {t('templates.newDraft')}
            </Button>
          )}
          {!readOnly && (
            <>
              <Button variant="secondary" data-testid="tpl-save" icon={<Icon as={Save} size={16} />} loading={save.isPending} disabled={!dirty || !check.success} onClick={() => save.mutate()}>
                {t('templates.save')}
              </Button>
              <Button data-testid="tpl-publish" icon={<Icon as={Send} size={16} />} loading={publish.isPending} disabled={!check.success} onClick={() => publish.mutate()}>
                {t('templates.publish')}
              </Button>
            </>
          )}
        </div>
      </div>
    </Page>
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
