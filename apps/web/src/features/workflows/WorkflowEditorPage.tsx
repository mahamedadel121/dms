'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { ArrowRight, FlaskConical, Plus, Save, Send, Trash2 } from 'lucide-react';
import type { RequestTypeDto } from '@dms/shared';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDateTime } from '@/lib/format';
import { Badge, Card, ErrorBlock, LoadingBlock, PageHeader } from '@/components/ui/Display';
import { Button } from '@/components/ui/Button';
import { Checkbox, FormField, Input } from '@/components/ui/Fields';
import { ConfirmDialog } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useLookup } from '@/components/ui/Inputs2';
import { useTr } from '../common/useTr';
import type { WorkflowDto, WorkflowStepDto, WorkflowVersionDto } from '../types';
import { StepCard } from './StepCard';
import { blankStep, fromDto, moveStep, toInput, validateSteps, type EditableStep } from './stepModel';

const vTone = { DRAFT: 'amber', ACTIVE: 'green', ARCHIVED: 'gray' } as const;

export function WorkflowEditorPage({ id }: { id: string }) {
  const { t, locale } = useTr();
  const { can } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const canManage = can('workflows.manage');

  const wf = useQuery({ queryKey: ['workflow', id], queryFn: () => api.get<WorkflowDto>(`/workflows/${id}`) });
  const versions = useMemo(() => [...(wf.data?.versions ?? [])].sort((a, b) => b.version - a.version), [wf.data]);
  const [versionId, setVersionId] = useState('');
  useEffect(() => {
    if (!versionId && versions.length > 0) setVersionId((versions.find((v) => v.status === 'DRAFT') ?? versions.find((v) => v.status === 'ACTIVE') ?? versions[0]!).id);
  }, [versions, versionId]);
  const current = versions.find((v) => v.id === versionId);
  const readOnly = !canManage || current?.status !== 'DRAFT';

  const ver = useQuery({
    queryKey: ['wf-version', versionId],
    enabled: !!versionId,
    queryFn: () => api.get<WorkflowVersionDto>(`/workflow-versions/${versionId}`),
  });

  const [steps, setSteps] = useState<EditableStep[]>([]);
  const [note, setNote] = useState('');
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (ver.data) {
      setSteps((ver.data.steps ?? []).slice().sort((a: WorkflowStepDto, b: WorkflowStepDto) => a.sortOrder - b.sortOrder).map(fromDto));
      setNote(ver.data.note ?? '');
      setDirty(false);
    }
  }, [ver.data]);

  const roles = useLookup('roles');
  const roleName = (rid: string) => roles.data?.find((r) => r.id === rid)?.label ?? '';

  const issues = useMemo(() => validateSteps(steps), [steps]);
  const issueFor = (i: number) => issues.filter((x) => 'index' in x && x.index === i);

  const update = (uid: string, patch: Partial<EditableStep>) => {
    setSteps((l) => l.map((s) => (s.uid === uid ? { ...s, ...patch } : s)));
    setDirty(true);
  };
  const move = (from: number, to: number) => {
    setSteps((l) => moveStep(l, from, to));
    setDirty(true);
  };
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = steps.findIndex((s) => s.uid === e.active.id);
    const to = steps.findIndex((s) => s.uid === e.over!.id);
    move(from, to);
  };
  const groups = [...new Set(steps.map((s) => s.parallelGroup.trim()).filter(Boolean))];
  const groupWithPrev = (i: number) => {
    const prev = steps[i - 1]!;
    const g = prev.parallelGroup.trim() || `g${i}`;
    setSteps((l) => l.map((s, j) => (j === i || j === i - 1 ? { ...s, parallelGroup: g } : s)));
    setDirty(true);
  };

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ['workflow', id] });
    await qc.invalidateQueries({ queryKey: ['wf-version'] });
    await qc.invalidateQueries({ queryKey: ['workflows'] });
  };
  const save = useMutation({
    mutationFn: () => api.put(`/workflow-versions/${versionId}`, { note: note.trim() || null, steps: steps.map(toInput) }),
    onSuccess: async () => {
      toast.success(t('workflows.saved'));
      await refresh();
    },
    onError: (e) => toast.error(e),
  });
  const publish = useMutation({
    mutationFn: async () => {
      await api.put(`/workflow-versions/${versionId}`, { note: note.trim() || null, steps: steps.map(toInput) });
      return api.post(`/workflow-versions/${versionId}/publish`);
    },
    onSuccess: async () => {
      toast.success(t('workflows.published'));
      setConfirmPublish(false);
      await refresh();
    },
    onError: (e) => toast.error(e),
  });
  const draft = useMutation({
    mutationFn: () => api.post<WorkflowVersionDto>(`/workflows/${id}/versions`, { basedOnVersionId: versionId || undefined }),
    onSuccess: async (v) => {
      toast.success(t('workflows.draftCreated'));
      await refresh();
      if (v?.id) setVersionId(v.id);
    },
    onError: (e) => toast.error(e),
  });
  const del = useMutation({
    mutationFn: () => api.del(`/workflow-versions/${versionId}`),
    onSuccess: async () => {
      toast.success(t('workflows.draftDeleted'));
      setConfirmDelete(false);
      setVersionId('');
      await refresh();
    },
    onError: (e) => toast.error(e),
  });
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const hasDraft = versions.some((v) => v.status === 'DRAFT');

  if (wf.isLoading) return <LoadingBlock />;
  if (wf.isError || !wf.data) return <ErrorBlock message={errorMessage(wf.error)} />;

  return (
    <div className="space-y-4">
      <Link href="/workflows" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowRight className="h-4 w-4 rtl:rotate-0 ltr:rotate-180" aria-hidden /> {t('workflows.back')}
      </Link>
      <PageHeader title={locale === 'ar' ? wf.data.nameAr : wf.data.nameEn || wf.data.nameAr} subtitle={wf.data.requestTypeCode} />

      <Card title={t('workflows.versions')}>
        <div className="flex flex-wrap items-center gap-2">
          {versions.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => {
                if (dirty && !window.confirm(t('workflows.discardChanges'))) return;
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
            <Button size="sm" variant="secondary" icon={<Plus className="h-4 w-4" />} loading={draft.isPending} disabled={hasDraft} onClick={() => draft.mutate()}>
              {t('workflows.newDraft')}
            </Button>
          )}
        </div>
        {current && current.status !== 'DRAFT' && <p className="mt-2 text-xs text-slate-500">{t('workflows.readOnlyHint')}</p>}
      </Card>

      {ver.isLoading ? (
        <LoadingBlock />
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <FormField label={t('workflows.note')} className="min-w-[16rem] flex-1">
              {(fid) => <Input id={fid} readOnly={readOnly} value={note} onChange={(e) => { setNote(e.target.value); setDirty(true); }} />}
            </FormField>
            {!readOnly && (
              <div className="flex flex-wrap gap-2 pb-0.5">
                <Button variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => { setSteps((l) => [...l, blankStep(l.map((s) => s.key))]); setDirty(true); }}>
                  {t('workflows.addStep')}
                </Button>
                <Button variant="secondary" icon={<Save className="h-4 w-4" />} loading={save.isPending} disabled={!dirty} onClick={() => save.mutate()}>
                  {t('common.save')}
                </Button>
                <Button icon={<Send className="h-4 w-4" />} disabled={issues.length > 0} onClick={() => setConfirmPublish(true)}>
                  {t('workflows.publish')}
                </Button>
                <Button variant="danger" icon={<Trash2 className="h-4 w-4" />} onClick={() => setConfirmDelete(true)}>
                  {t('workflows.deleteDraft')}
                </Button>
              </div>
            )}
          </div>

          {issues.length > 0 && !readOnly && <p className="text-sm text-red-700">{t('workflows.fixIssues', { n: issues.length })}</p>}

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={steps.map((s) => s.uid)} strategy={verticalListSortingStrategy}>
              <ol className="space-y-2">
                {steps.map((s, i) => (
                  <StepCard
                    key={s.uid}
                    step={s}
                    index={i}
                    total={steps.length}
                    issues={issueFor(i)}
                    readOnly={readOnly}
                    groups={groups}
                    roleLabel={roleName(s.roleId)}
                    onChange={(p) => update(s.uid, p)}
                    onMove={(d) => move(i, i + d)}
                    onRemove={() => { setSteps((l) => l.filter((x) => x.uid !== s.uid)); setDirty(true); }}
                    onGroupWithPrev={() => groupWithPrev(i)}
                  />
                ))}
              </ol>
            </SortableContext>
          </DndContext>

          {versionId && <Simulator versionId={versionId} requestTypeId={wf.data.requestTypeId} steps={steps} dirty={dirty} />}
        </>
      )}

      <ConfirmDialog open={confirmPublish} onClose={() => setConfirmPublish(false)} onConfirm={() => publish.mutate()} loading={publish.isPending} title={t('workflows.publish')} message={t('workflows.publishConfirm')} />
      <ConfirmDialog open={confirmDelete} onClose={() => setConfirmDelete(false)} onConfirm={() => del.mutate()} loading={del.isPending} danger title={t('workflows.deleteDraft')} />
    </div>
  );
}

/** Try the saved draft against sample categories and a total (POST /workflow-versions/:id/simulate). */
function Simulator({ versionId, requestTypeId, steps, dirty }: { versionId: string; requestTypeId: string; steps: EditableStep[]; dirty: boolean }) {
  const { t, locale } = useTr();
  const [cats, setCats] = useState<string[]>([]);
  const [total, setTotal] = useState('1000');
  const type = useQuery({ queryKey: ['request-type', requestTypeId], queryFn: () => api.get<RequestTypeDto>(`/request-types/${requestTypeId}`), staleTime: 60_000 });
  const sim = useMutation({
    mutationFn: () => api.post<unknown>(`/workflow-versions/${versionId}/simulate`, { categoryIds: cats, totalAmount: total || '0' }),
  });
  const result = sim.data as unknown;
  const applicable = extractApplicable(result);
  return (
    <Card title={t('workflows.simulate.title')} actions={<FlaskConical className="h-4 w-4 text-slate-400" aria-hidden />}>
      <p className="mb-2 text-xs text-slate-500">{dirty ? t('workflows.simulate.saveFirst') : t('workflows.simulate.hint')}</p>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {(type.data?.lineCategories ?? []).filter((c) => c.isActive).map((c) => (
          <Checkbox key={c.id} checked={cats.includes(c.id)} onChange={(v) => setCats((l) => (v ? [...l, c.id] : l.filter((x) => x !== c.id)))} label={locale === 'ar' ? c.nameAr : c.nameEn || c.nameAr} />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <FormField label={t('workflows.simulate.total')} className="w-40">{(fid) => <Input id={fid} inputMode="decimal" dir="ltr" value={total} onChange={(e) => setTotal(e.target.value)} />}</FormField>
        <Button variant="secondary" loading={sim.isPending} disabled={dirty} onClick={() => sim.mutate()}>
          {t('workflows.simulate.run')}
        </Button>
      </div>
      {sim.isError && <p className="mt-2 text-sm text-red-700">{errorMessage(sim.error)}</p>}
      {sim.isSuccess && (
        <div className="mt-3">
          {applicable ? (
            <ul className="flex flex-wrap gap-2">
              {steps.map((s) => {
                const a = applicable.get(s.key);
                if (a === undefined) return null;
                return (
                  <li key={s.uid}>
                    <Badge tone={a ? 'green' : 'gray'}>
                      {(locale === 'ar' ? s.nameAr : s.nameEn) || s.key}: {t(a ? 'workflows.simulate.applies' : 'workflows.simulate.skipped')}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          ) : (
            <pre dir="ltr" className="max-h-60 overflow-auto rounded bg-slate-50 p-2 text-xs">{JSON.stringify(result, null, 2)}</pre>
          )}
        </div>
      )}
    </Card>
  );
}

/** Best-effort reading of the simulate response: an array / `steps` of { key|stepKey, applicable|active|status }. */
function extractApplicable(r: unknown): Map<string, boolean> | null {
  const list = Array.isArray(r) ? r : Array.isArray((r as { steps?: unknown })?.steps) ? (r as { steps: unknown[] }).steps : null;
  if (!list) return null;
  const m = new Map<string, boolean>();
  for (const it of list) {
    const o = it as Record<string, unknown>;
    const key = (o.key ?? o.stepKey) as string | undefined;
    if (!key) continue;
    const a = o.applicable ?? o.applies ?? o.active;
    if (typeof a === 'boolean') m.set(key, a);
    else if (typeof o.status === 'string') m.set(key, o.status !== 'NOT_APPLICABLE');
  }
  return m.size > 0 ? m : null;
}

