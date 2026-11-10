'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { FlaskConical, Plus, Save, Send, Trash2 } from 'lucide-react';
import type { RequestTypeDto } from '@dms/shared';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatEgp } from '@/lib/format';
import { Badge, Banner, Button, Card, Checkbox, Code, ConfirmDialog, DateText, ErrorBlock, FormField, Input, LoadingBlock, Page, PageHeader, StatusChip, useLookup, useToast } from '@/components/ui';
import { useTr } from '../common/useTr';
import type { WorkflowDto, WorkflowStepDto, WorkflowVersionDto } from '../types';
import { StepCard } from './StepCard';
import { describeCondition } from './describe';
import { countApplicable, extractApplicable, type SimulationResult } from './preview';
import { blankStep, fromDto, moveStep, toInput, validateSteps, type EditableStep } from './stepModel';

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

  const requestTypeId = wf.data?.requestTypeId ?? '';
  const type = useQuery({ queryKey: ['request-type', requestTypeId], enabled: !!requestTypeId, queryFn: () => api.get<RequestTypeDto>(`/request-types/${requestTypeId}`), staleTime: 60_000 });
  const categoryNames = useMemo(() => Object.fromEntries((type.data?.lineCategories ?? []).map((c) => [c.code, locale === 'ar' ? c.nameAr : c.nameEn || c.nameAr])), [type.data, locale]);
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

  const [sim, setSim] = useState<SimulationResult | null>(null);
  useEffect(() => {
    setSim(null);
  }, [versionId]);

  if (wf.isLoading) return <LoadingBlock />;
  if (wf.isError || !wf.data) return <ErrorBlock message={errorMessage(wf.error)} />;

  const describeCtx = { categoryNames, money: (v: string) => formatEgp(v, locale) };
  const renderStep = (s: EditableStep, i: number) => (
    <StepCard
      key={s.uid}
      step={s}
      index={i}
      total={steps.length}
      issues={issueFor(i)}
      readOnly={readOnly}
      groups={groups}
      roleLabel={roleName(s.roleId)}
      description={describeCondition(s.condition, t, describeCtx)}
      onChange={(p) => update(s.uid, p)}
      onMove={(d) => move(i, i + d)}
      onRemove={() => {
        setSteps((l) => l.filter((x) => x.uid !== s.uid));
        setDirty(true);
      }}
      onGroupWithPrev={() => groupWithPrev(i)}
    />
  );
  // consecutive steps sharing a parallelGroup are drawn inside one dashed container
  const runs: { group: string; items: { s: EditableStep; i: number }[] }[] = [];
  steps.forEach((s, i) => {
    const g = s.parallelGroup.trim();
    const last = runs[runs.length - 1];
    if (g && last && last.group === g) last.items.push({ s, i });
    else runs.push({ group: g, items: [{ s, i }] });
  });
  const name = locale === 'ar' ? wf.data.nameAr : wf.data.nameEn || wf.data.nameAr;

  return (
    <Page testId="page-workflow-editor" width="wide">
      <PageHeader
        back={{ href: '/workflows', label: t('workflows.back') }}
        title={name}
        subtitle={<Code>{wf.data.requestTypeCode}</Code>}
        actions={
          canManage && (
            <>
              <Button variant="secondary" data-testid="wf-new-draft" icon={<Plus className="h-4 w-4" />} loading={draft.isPending} disabled={hasDraft} onClick={() => draft.mutate()}>
                {t('workflows.newDraft')}
              </Button>
              {!readOnly && (
                <>
                  <Button variant="danger-outline" data-testid="wf-delete-draft" icon={<Trash2 className="h-4 w-4" />} onClick={() => setConfirmDelete(true)}>
                    {t('workflows.deleteDraft')}
                  </Button>
                  <Button variant="secondary" data-testid="wf-save" icon={<Save className="h-4 w-4" />} loading={save.isPending} disabled={!dirty} onClick={() => save.mutate()}>
                    {t('common.save')}
                  </Button>
                  <Button data-testid="wf-publish" icon={<Send className="h-4 w-4" />} disabled={issues.length > 0} onClick={() => setConfirmPublish(true)}>
                    {t('workflows.publish')}
                  </Button>
                </>
              )}
            </>
          )
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-6">
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
            <div className="mt-3">
              <FormField label={t('workflows.note')}>
                {(fid) => (
                  <Input
                    id={fid}
                    readOnly={readOnly}
                    value={note}
                    onChange={(e) => {
                      setNote(e.target.value);
                      setDirty(true);
                    }}
                  />
                )}
              </FormField>
            </div>
          </Card>

          {ver.isLoading ? (
            <LoadingBlock />
          ) : (
            <section aria-label={t('workflows.route')} className="space-y-3">
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                <SortableContext items={steps.map((s) => s.uid)} strategy={verticalListSortingStrategy}>
                  <ol className="relative space-y-3 before:absolute before:inset-y-3 before:start-[25px] before:w-0.5 before:bg-hairline">
                    {runs.map((r) =>
                      r.group && r.items.length > 1 ? (
                        <li key={r.items[0]!.s.uid} className="relative rounded-lg border border-dashed border-line bg-canvas p-2">
                          <p className="mb-2 px-1 text-xs font-medium text-ink-3">
                            {t('workflows.parallelGroup')} <Code>{r.group}</Code>
                          </p>
                          <div className="space-y-2">{r.items.map(({ s, i }) => renderStep(s, i))}</div>
                        </li>
                      ) : (
                        <li key={r.items[0]!.s.uid} className="relative">
                          {renderStep(r.items[0]!.s, r.items[0]!.i)}
                        </li>
                      ),
                    )}
                  </ol>
                </SortableContext>
              </DndContext>
              {!readOnly && (
                <Button
                  variant="secondary"
                  data-testid="wf-add-step"
                  icon={<Plus className="h-4 w-4" />}
                  onClick={() => {
                    setSteps((l) => [...l, blankStep(l.map((s) => s.key))]);
                    setDirty(true);
                  }}
                >
                  {t('workflows.addStep')}
                </Button>
              )}
            </section>
          )}
        </div>

        <aside className="space-y-6 xl:sticky xl:top-[84px] xl:self-start">
          {versionId && <Simulator versionId={versionId} categories={type.data?.lineCategories ?? []} steps={steps} dirty={dirty} sim={sim} onResult={setSim} />}
          {issues.length > 0 && !readOnly && (
            <Banner tone="warning" title={t('workflows.fixIssues', { n: issues.length })}>
              <ul className="mt-1 list-disc space-y-0.5 ps-5">
                {issues.map((x, k) => (
                  <li key={k}>
                    {'index' in x ? `${x.index + 1}: ` : ''}
                    {t(`workflows.issue.${x.code}`)}
                  </li>
                ))}
              </ul>
            </Banner>
          )}
        </aside>
      </div>

      <ConfirmDialog open={confirmPublish} onClose={() => setConfirmPublish(false)} onConfirm={() => publish.mutate()} loading={publish.isPending} title={t('workflows.publish')} message={t('workflows.publishConfirm')} />
      <ConfirmDialog open={confirmDelete} onClose={() => setConfirmDelete(false)} onConfirm={() => del.mutate()} loading={del.isPending} danger title={t('workflows.deleteDraft')} message={t('workflows.deleteConfirm')} />
    </Page>
  );
}

/** Try the saved draft against sample categories and a total (POST /workflow-versions/:id/simulate). */
function Simulator({
  versionId,
  categories,
  steps,
  dirty,
  sim,
  onResult,
}: {
  versionId: string;
  categories: { id: string; nameAr: string; nameEn: string; isActive: boolean }[];
  steps: EditableStep[];
  dirty: boolean;
  sim: SimulationResult | null;
  onResult: (r: SimulationResult | null) => void;
}) {
  const { t, locale } = useTr();
  const [cats, setCats] = useState<string[]>([]);
  const [total, setTotal] = useState('1000');
  const run = useMutation({
    mutationFn: () => api.post<unknown>(`/workflow-versions/${versionId}/simulate`, { categoryIds: cats, totalAmount: total || '0' }),
    onSuccess: (r) => onResult(extractApplicable(r)),
  });
  return (
    <Card title={t('workflows.simulate.title')} actions={<FlaskConical className="h-4 w-4 text-ink-3" aria-hidden />}>
      <div data-testid="wf-simulator">
        <p className="mb-2 text-xs text-ink-3">{dirty ? t('workflows.simulate.saveFirst') : t('workflows.simulate.hint')}</p>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {categories
            .filter((c) => c.isActive)
            .map((c) => (
              <Checkbox key={c.id} checked={cats.includes(c.id)} onChange={(v) => setCats((l) => (v ? [...l, c.id] : l.filter((x) => x !== c.id)))} label={locale === 'ar' ? c.nameAr : c.nameEn || c.nameAr} />
            ))}
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <FormField label={t('workflows.simulate.total')} className="w-40">
            {(fid) => <Input id={fid} numeric value={total} onChange={(e) => setTotal(e.target.value)} />}
          </FormField>
          <Button variant="secondary" data-testid="wf-simulate" loading={run.isPending} disabled={dirty} onClick={() => run.mutate()}>
            {t('workflows.simulate.run')}
          </Button>
        </div>
        {run.isError && <p className="mt-2 text-sm text-danger">{errorMessage(run.error)}</p>}
        {run.isSuccess && (
          <div className="mt-3 space-y-2">
            {sim ? (
              <>
                <p className="text-sm font-medium text-ink">{t('workflows.sim.result', { n: countApplicable(steps, sim), total: steps.length })}</p>
                <ul className="flex flex-wrap gap-2">
                  {[...sim.entries()].map(([key, a]) => {
                    const base = steps.find((s) => s.key === key.split(':')[0]);
                    const suffix = key.includes(':') ? ` (${key.split(':')[1]})` : '';
                    return (
                      <li key={key}>
                        <Badge tone={a ? 'green' : 'gray'}>
                          {((locale === 'ar' ? base?.nameAr : base?.nameEn) || key.split(':')[0]) + suffix}: {t(a ? 'workflows.simulate.applies' : 'workflows.simulate.skipped')}
                        </Badge>
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : (
              <pre dir="ltr" className="max-h-60 overflow-auto rounded bg-surface-2 p-2 text-xs">
                {JSON.stringify(run.data, null, 2)}
              </pre>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
