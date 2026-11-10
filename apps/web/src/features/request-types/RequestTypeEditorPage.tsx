'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { ATTACHMENT_MIME_TYPES, type AttachmentMimeType, type LineCategoryDto, type RequestModuleDto, type RequestTypeDto, type TemplateDto, type WorkflowDto } from '@dms/shared';
import { GripVertical, Plus } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';
import {
  ActiveBadge, Badge, Banner, Button, Card, Checkbox, Code, EmptyState, ErrorBlock, FormField, Icon, Input, LookupSelect, Page, PageHeader, Select, SkeletonCard, StatusChip, Switch, Tabs, useToast,
} from '@/components/ui';
import { CreateTemplateDialog } from '@/features/templates/CreateTemplateDialog';
import { CategoryDrawer } from './CategoryDrawer';
import { FieldListEditor } from './FieldListEditor';
import {
  EMPTY_TYPE_FORM,
  EXPENSE_RESERVED_KEYS,
  MIME_LABELS,
  attachmentPatch,
  attachmentRule,
  hasFieldErrors,
  toTypeInput,
  toTypeUpdate,
  typeToForm,
  validateFields,
  validateType,
  type Channel,
  type TypeForm,
} from './model';

type TabKey = 'basics' | 'fields' | 'categories' | 'attachments' | 'links';
interface AttEdit {
  minAttachments: number;
  maxAttachments: number;
  allowedMimeTypes: AttachmentMimeType[];
}
type TemplateRow = TemplateDto & { activeVersion?: number | null };

const sortCats = (list: LineCategoryDto[] | undefined) => [...(list ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
const Dot = () => <span className="ms-1.5 inline-block h-2 w-2 rounded-full bg-brass align-middle" aria-hidden />;

export function RequestTypeEditorPage({ id }: { id?: string }) {
  const { t, name } = useT();
  const { can } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const router = useRouter();
  const canManage = can('request_types.manage');
  const mode = id ? 'edit' : 'create';

  const q = useQuery({ queryKey: ['request-type', id], queryFn: () => api.get<RequestTypeDto>(`/request-types/${id}`), enabled: !!id && canManage });
  const modules = useQuery({ queryKey: ['request-types', 'modules'], queryFn: () => api.get<RequestModuleDto[]>('/request-types/modules'), enabled: canManage });

  const [tab, setTab] = useState<TabKey>('basics');
  const [form, setForm] = useState<TypeForm>(EMPTY_TYPE_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [att, setAtt] = useState<Record<string, AttEdit>>({});
  const loadedFor = useRef<string | null>(null);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get('tab');
    if (p && ['basics', 'fields', 'categories', 'attachments', 'links'].includes(p)) setTab(p as TabKey);
  }, []);

  useEffect(() => {
    if (q.data && loadedFor.current !== q.data.id) {
      loadedFor.current = q.data.id;
      setForm(typeToForm(q.data));
    }
  }, [q.data]);

  const cats = useMemo(() => sortCats(q.data?.lineCategories), [q.data]);
  const reserved = form.moduleKey === 'expense' ? EXPENSE_RESERVED_KEYS : [];

  // dirty tracking
  const update = useMemo(() => (q.data ? toTypeUpdate(form, q.data) : {}), [form, q.data]);
  const attChanged = useMemo(
    () => cats.filter((c) => att[c.id] && attachmentPatch(c, att[c.id]!) !== null).map((c) => c.id),
    [cats, att],
  );
  const dirtyBasics = mode === 'create' ? JSON.stringify({ ...form, headerFields: [] }) !== JSON.stringify(EMPTY_TYPE_FORM) : Object.keys(update).some((k) => k !== 'headerFields');
  const dirtyFields = mode === 'create' ? form.headerFields.length > 0 : 'headerFields' in update;
  const dirty = dirtyBasics || dirtyFields || attChanged.length > 0;

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const set = <K extends keyof TypeForm>(k: K, v: TypeForm[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => (e[k] ? { ...e, [k]: '' } : e));
  };
  const err = (k: string) => (errors[k] ? (errors[k].startsWith('rt.') ? t(errors[k]) : errors[k]) : undefined);

  const save = useMutation({
    mutationFn: async () => {
      if (mode === 'create') return api.post<RequestTypeDto>('/request-types', toTypeInput(form));
      if (Object.keys(update).length) await api.patch(`/request-types/${id}`, update);
      for (const cid of attChanged) {
        const patch = attachmentPatch(cats.find((c) => c.id === cid)!, att[cid]!);
        if (patch) await api.patch(`/request-types/${id}/line-categories/${cid}`, patch);
      }
      return null;
    },
    onSuccess: async (created) => {
      toast.success(t('common.saved'));
      void qc.invalidateQueries({ queryKey: ['request-types'] });
      if (created) {
        loadedFor.current = created.id;
        router.replace(`/admin/request-types/${created.id}?tab=categories`);
        return;
      }
      const fresh = await qc.fetchQuery({ queryKey: ['request-type', id], queryFn: () => api.get<RequestTypeDto>(`/request-types/${id}`), staleTime: 0 });
      qc.setQueryData(['request-type', id], fresh);
      setForm(typeToForm(fresh));
      setAtt({});
    },
    onError: (e) => toast.error(e),
  });

  function onSave() {
    const e = validateType(form, mode);
    if (hasFieldErrors(validateFields(form.headerFields, reserved))) e.headerFields = 'rt.err.FIELDS_INVALID';
    for (const c of cats) {
      const a = att[c.id];
      if (a && a.minAttachments > a.maxAttachments) e.attachments = 'rt.err.ATTACH_RANGE';
      if (a && a.allowedMimeTypes.length === 0) e.attachments = 'rt.err.MIME_REQUIRED';
    }
    setErrors(e);
    if (Object.keys(e).length) {
      if (e.headerFields) setTab('fields');
      else if (e.attachments) setTab('attachments');
      else setTab('basics');
      toast.error(t('rt.err.FIX_ERRORS'));
      return;
    }
    save.mutate();
  }

  if (!canManage) return <Page testId="page-request-type-editor"><ErrorBlock message={t('common.auth.forbiddenPage')} /></Page>;

  const tabs: { key: TabKey; label: string; dirty?: boolean }[] =
    mode === 'create'
      ? [
          { key: 'basics', label: t('rt.tab.basics'), dirty: dirtyBasics },
          { key: 'fields', label: t('rt.tab.fields'), dirty: dirtyFields },
        ]
      : [
          { key: 'basics', label: t('rt.tab.basics'), dirty: dirtyBasics },
          { key: 'fields', label: t('rt.tab.fields'), dirty: dirtyFields },
          { key: 'categories', label: t('rt.tab.categories') },
          { key: 'attachments', label: t('rt.tab.attachments'), dirty: attChanged.length > 0 },
          { key: 'links', label: t('rt.tab.links') },
        ];

  const title = mode === 'create' ? t('rt.newTitle') : q.data ? name(q.data) : '';
  const loading = mode === 'edit' && q.isLoading;

  return (
    <Page testId="page-request-type-editor" width="wide">
      <PageHeader
        back={{ href: '/admin/request-types', label: t('rt.back') }}
        title={title || t('common.loading')}
        subtitle={mode === 'edit' && q.data ? <Code>{q.data.code}</Code> : undefined}
        actions={
          <Button loading={save.isPending} disabled={!dirty || loading} onClick={onSave} data-testid="rt-save">
            {t('common.save')}
          </Button>
        }
      />
      {q.isError && <ErrorBlock message={errorMessage(q.error)} onRetry={() => void q.refetch()} />}
      {loading ? (
        <SkeletonCard lines={6} />
      ) : (
        <>
          <Tabs
            value={tab}
            onChange={(k) => setTab(k as TabKey)}
            items={tabs.map((x) => ({ key: x.key, label: <span>{x.label}{x.dirty && <Dot />}</span> }))}
          />

          {tab === 'basics' && (
            <Card>
              <div className="grid gap-4 md:grid-cols-2">
                <FormField label={t('common.code')} required={mode === 'create'} error={err('code')} hint={t('rt.basics.codeHint')}>
                  {(fid) => (
                    <Input id={fid} dir="ltr" disabled={mode === 'edit'} value={form.code} invalid={!!errors.code} data-testid="rt-code" onChange={(e) => set('code', e.target.value.toUpperCase())} />
                  )}
                </FormField>
                <FormField
                  label={t('rt.basics.prefix')}
                  required={mode === 'create'}
                  error={err('numberPrefix')}
                  hint={t('rt.basics.prefixPreview', { example: `${form.numberPrefix.trim().toUpperCase() || 'XX'}-26-000123` })}
                >
                  {(fid) => (
                    <Input id={fid} dir="ltr" maxLength={4} disabled={mode === 'edit'} value={form.numberPrefix} invalid={!!errors.numberPrefix} data-testid="rt-prefix" onChange={(e) => set('numberPrefix', e.target.value.toUpperCase())} />
                  )}
                </FormField>
                <FormField label={t('common.nameAr')} required error={err('nameAr')}>
                  {(fid) => <Input id={fid} value={form.nameAr} invalid={!!errors.nameAr} data-testid="rt-name-ar" onChange={(e) => set('nameAr', e.target.value)} />}
                </FormField>
                <FormField label={t('common.nameEn')} required error={err('nameEn')}>
                  {(fid) => <Input id={fid} dir="ltr" value={form.nameEn} invalid={!!errors.nameEn} data-testid="rt-name-en" onChange={(e) => set('nameEn', e.target.value)} />}
                </FormField>
                <FormField label={t('rt.basics.department')}>
                  {(fid) => <LookupSelect id={fid} entity="departments" value={form.departmentId} placeholder={t('rt.basics.noDepartment')} onChange={(v) => set('departmentId', v)} />}
                </FormField>
                <FormField label={t('rt.basics.module')} hint={t('rt.module.hint')}>
                  {(fid) => (
                    <Select
                      id={fid}
                      value={form.moduleKey}
                      placeholder={t('rt.module.none')}
                      options={(modules.data ?? []).map((m) => ({ value: m.key, label: m.key }))}
                      onChange={(v) => set('moduleKey', v)}
                    />
                  )}
                </FormField>
                <FormField label={t('rt.basics.channels')} error={err('channels')} className="md:col-span-2">
                  <div className="flex flex-wrap gap-6">
                    {(['TELEGRAM', 'WEB'] as Channel[]).map((c) => (
                      <Checkbox
                        key={c}
                        label={t(`rt.channel.${c}`)}
                        checked={form.channels.includes(c)}
                        data-testid={`rt-channel-${c}`}
                        onChange={(on) => set('channels', on ? [...form.channels, c] : form.channels.filter((x) => x !== c))}
                      />
                    ))}
                  </div>
                </FormField>
                <div className="flex flex-wrap gap-8 md:col-span-2">
                  <Switch checked={form.hasLines} onChange={(v) => set('hasLines', v)} label={t('rt.basics.hasLines')} />
                  <Switch checked={form.isActive} onChange={(v) => set('isActive', v)} label={t('common.active')} />
                </div>
              </div>
            </Card>
          )}

          {tab === 'fields' && (
            <Card title={t('rt.tab.fields')}>
              <div className="space-y-4">
                <Banner tone="info">{t('rt.fields.botNote')}</Banner>
                {errors.headerFields && <p className="text-xs font-medium text-danger" role="alert">{err('headerFields')}</p>}
                <FieldListEditor value={form.headerFields} onChange={(v) => set('headerFields', v)} testIdPrefix="rt-field" addTestId="rt-add-field" reservedKeys={reserved} />
              </div>
            </Card>
          )}

          {mode === 'edit' && q.data && tab === 'categories' && <CategoriesTab type={q.data} cats={cats} />}

          {mode === 'edit' && tab === 'attachments' && (
            <Card padded={false} title={t('rt.tab.attachments')} subtitle={t('rt.att.hint')}>
              {errors.attachments && <p className="px-5 pt-3 text-xs font-medium text-danger" role="alert">{err('attachments')}</p>}
              {cats.length === 0 ? (
                <EmptyState compact title={t('rt.cat.empty')} />
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-surface-2">
                      <tr>
                        <th className="h-10 px-4 text-start text-13 font-medium text-ink-2">{t('rt.col.name')}</th>
                        <th className="h-10 px-2 text-start text-13 font-medium text-ink-2">{t('rt.cat.minAttachments')}</th>
                        <th className="h-10 px-2 text-start text-13 font-medium text-ink-2">{t('rt.cat.maxAttachments')}</th>
                        <th className="h-10 px-4 text-start text-13 font-medium text-ink-2">{t('rt.cat.allowedTypes')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cats.map((c) => {
                        const cur: AttEdit = att[c.id] ?? {
                          minAttachments: c.minAttachments,
                          maxAttachments: c.maxAttachments,
                          allowedMimeTypes: c.allowedMimeTypes.filter((m): m is AttachmentMimeType => (ATTACHMENT_MIME_TYPES as readonly string[]).includes(m)),
                        };
                        const put = (p: Partial<AttEdit>) => setAtt((a) => ({ ...a, [c.id]: { ...cur, ...p } }));
                        const num = (v: string) => {
                          const n = parseInt(v, 10);
                          return Number.isFinite(n) && n >= 0 ? n : 0;
                        };
                        return (
                          <tr key={c.id} className="border-t border-hairline" data-testid="rt-att-row">
                            <td className="px-4 py-2 font-medium text-ink">{name(c)}</td>
                            <td className="px-2 py-2"><Input numeric className="w-20" value={String(cur.minAttachments)} onChange={(e) => put({ minAttachments: num(e.target.value) })} /></td>
                            <td className="px-2 py-2"><Input numeric className="w-20" value={String(cur.maxAttachments)} onChange={(e) => put({ maxAttachments: num(e.target.value) })} /></td>
                            <td className="px-4 py-2">
                              <div className="flex flex-wrap gap-4">
                                {ATTACHMENT_MIME_TYPES.map((m) => (
                                  <Checkbox
                                    key={m}
                                    label={MIME_LABELS[m]}
                                    checked={cur.allowedMimeTypes.includes(m)}
                                    onChange={(on) => put({ allowedMimeTypes: on ? [...cur.allowedMimeTypes, m] : cur.allowedMimeTypes.filter((x) => x !== m) })}
                                  />
                                ))}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}

          {mode === 'edit' && q.data && tab === 'links' && <LinksTab type={q.data} />}
        </>
      )}
    </Page>
  );
}

// ---------------------------------------------------------------- categories tab

function CatRow({ c, onOpen, onToggle }: { c: LineCategoryDto; onOpen: () => void; onToggle: (v: boolean) => void }) {
  const { t, name } = useT();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: c.id });
  const style: CSSProperties = {
    transform: transform ? `translate3d(${Math.round(transform.x)}px, ${Math.round(transform.y)}px, 0)` : undefined,
    transition,
  };
  return (
    <li
      ref={setNodeRef}
      style={style}
      data-testid="rt-cat-row"
      data-code={c.code}
      className={cn('flex items-center gap-3 rounded-lg border border-hairline bg-surface px-2 py-2', !c.isActive && 'text-ink-3', isDragging && 'relative z-10 shadow-pop')}
    >
      <button type="button" className="flex h-8 w-8 shrink-0 cursor-grab touch-none items-center justify-center rounded text-ink-3 hover:bg-surface-2 active:cursor-grabbing" aria-label={t('rt.fields.drag')} {...attributes} {...listeners}>
        <Icon as={GripVertical} size={16} />
      </button>
      <button type="button" className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1 text-start" onClick={onOpen}>
        {c.icon && <Code className="text-xs text-ink-3">{c.icon}</Code>}
        <span className="min-w-0 flex-1 basis-40">
          <span className="block truncate text-sm font-medium text-ink">{name(c)}</span>
          <span className="block truncate text-xs text-ink-3" dir="ltr">{c.nameEn}</span>
        </span>
        <Code className="text-xs">{c.code}</Code>
        <Badge size="sm" tone="gray">{t('rt.cat.rolesCount', { n: c.approvalRoleIds.length })}</Badge>
        <Badge size="sm" tone="gray">{t('rt.cat.attachRule', { rule: attachmentRule(c) })}</Badge>
      </button>
      <Switch checked={c.isActive} onChange={onToggle} label={<span className="sr-only">{t('common.active')}</span>} />
    </li>
  );
}

function CategoriesTab({ type, cats }: { type: RequestTypeDto; cats: LineCategoryDto[] }) {
  const { t } = useT();
  const toast = useToast();
  const qc = useQueryClient();
  const [order, setOrder] = useState<string[] | null>(null);
  const [drawer, setDrawer] = useState<{ open: boolean; category: LineCategoryDto | null }>({ open: false, category: null });
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const shown = useMemo(() => {
    if (!order) return cats;
    const byId = new Map(cats.map((c) => [c.id, c]));
    const ordered = order.map((i) => byId.get(i)).filter((c): c is LineCategoryDto => !!c);
    return ordered.length === cats.length ? ordered : cats;
  }, [cats, order]);

  const reorder = useMutation({
    mutationFn: (ids: string[]) => api.put<RequestTypeDto>(`/request-types/${type.id}/line-categories/order`, { ids }),
    onSuccess: (r) => {
      qc.setQueryData(['request-type', type.id], r);
      setOrder(null);
    },
    onError: (e) => {
      setOrder(null);
      toast.error(e);
    },
  });
  const toggle = useMutation({
    mutationFn: (v: { id: string; isActive: boolean }) => api.patch(`/request-types/${type.id}/line-categories/${v.id}`, { isActive: v.isActive }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['request-type', type.id] }),
    onError: (e) => toast.error(e),
  });

  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const ids = shown.map((c) => c.id);
    const next = arrayMove(ids, ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id)));
    setOrder(next);
    reorder.mutate(next);
  }

  return (
    <Card
      title={t('rt.tab.categories')}
      actions={
        <Button size="sm" icon={<Icon as={Plus} size={16} />} data-testid="rt-add-category" onClick={() => setDrawer({ open: true, category: null })}>
          {t('rt.cat.add')}
        </Button>
      }
    >
      {shown.length === 0 ? (
        <EmptyState compact title={t('rt.cat.empty')} hint={t('rt.cat.emptyHint')} />
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={shown.map((c) => c.id)} strategy={verticalListSortingStrategy}>
            <ul className="space-y-2">
              {shown.map((c) => (
                <CatRow key={c.id} c={c} onOpen={() => setDrawer({ open: true, category: c })} onToggle={(v) => toggle.mutate({ id: c.id, isActive: v })} />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
      <CategoryDrawer
        open={drawer.open}
        onClose={() => setDrawer((d) => ({ ...d, open: false }))}
        requestTypeId={type.id}
        category={drawer.category}
        nextSortOrder={cats.length ? Math.max(...cats.map((c) => c.sortOrder)) + 10 : 0}
      />
    </Card>
  );
}

// ---------------------------------------------------------------- route and templates tab

function LinksTab({ type }: { type: RequestTypeDto }) {
  const { t, name } = useT();
  const { can } = useAuth();
  const qc = useQueryClient();
  const router = useRouter();
  const [dialog, setDialog] = useState(false);
  const canTemplates = can('templates.manage');

  const wf = useQuery({ queryKey: ['workflow', type.workflowId], queryFn: () => api.get<WorkflowDto>(`/workflows/${type.workflowId}`), enabled: !!type.workflowId });
  const active = wf.data?.versions?.find((v) => v.status === 'ACTIVE');
  const tpls = useQuery({
    queryKey: ['templates', 'by-type', type.id],
    queryFn: async () => {
      const r = await api.get<{ items: TemplateRow[] } | TemplateRow[]>('/templates', { requestTypeId: type.id });
      return Array.isArray(r) ? r : r.items;
    },
    enabled: canTemplates,
  });

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title={t('rt.links.workflow')}>
        <div className="space-y-3">
          {wf.isLoading && type.workflowId ? (
            <SkeletonCard lines={2} />
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              {active ? <StatusChip kind="version" status="ACTIVE" label={`v${active.version}`} /> : <Badge tone="gray">{t('rt.noActiveWorkflow')}</Badge>}
              {active?.steps && <span className="text-sm text-ink-2">{t('rt.links.steps', { n: active.steps.length })}</span>}
            </div>
          )}
          {!active && <Banner tone="warning">{t('rt.links.noActiveWorkflow')}</Banner>}
          {type.workflowId && can(['workflows.view', 'workflows.manage']) && (
            <Link href={`/workflows/${type.workflowId}`}>
              <Button variant="secondary">{t('rt.links.openRoute')}</Button>
            </Link>
          )}
        </div>
      </Card>

      {canTemplates && (
        <Card
          title={t('rt.links.templates')}
          actions={<Button size="sm" icon={<Icon as={Plus} size={16} />} onClick={() => setDialog(true)}>{t('rt.links.newTemplate')}</Button>}
        >
          {tpls.isLoading ? (
            <SkeletonCard lines={2} />
          ) : (tpls.data ?? []).length === 0 ? (
            <Banner tone="info">{t('rt.links.noTemplate')}</Banner>
          ) : (
            <ul className="divide-y divide-hairline">
              {(tpls.data ?? []).map((tp) => (
                <li key={tp.id} className="flex flex-wrap items-center gap-3 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{name(tp)}</span>
                    <Code className="text-xs text-ink-3">{tp.code}</Code>
                  </span>
                  {tp.isDefault && <Badge size="sm" tone="brass">{t('rt.links.default')}</Badge>}
                  {tp.activeVersion ? <StatusChip kind="version" status="ACTIVE" size="sm" label={`v${tp.activeVersion}`} /> : <ActiveBadge active={tp.isActive} />}
                  <Link href={`/templates/${tp.id}`} className="text-sm text-link hover:underline">{t('rt.links.open')}</Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
      <CreateTemplateDialog
        open={dialog}
        onClose={() => setDialog(false)}
        requestTypeId={type.id}
        onCreated={(tp) => {
          setDialog(false);
          void qc.invalidateQueries({ queryKey: ['templates'] });
          router.push(`/templates/${tp.id}`);
        }}
      />
    </div>
  );
}
