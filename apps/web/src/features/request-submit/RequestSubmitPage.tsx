'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Check, FilePlus2, Plus } from 'lucide-react';
import type { LineCategoryDto, RequestTypeDto } from '@dms/shared';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Banner, Button, Card, DL, DLItem, EmptyState, ErrorBlock, Icon, LoadingBlock, Money, Page, PageHeader, Tabs, useToast } from '@/components/ui';
import { useTr } from '../common/useTr';
import { FieldInput, FieldValue } from './FieldInput';
import { LineEditor } from './LineEditor';
import {
  activeCategories, buildCreateBody, draftTotal, headerKey, issueKeyFromServer, newLine, sortedFields, validateDraft, webTypes,
  type IssueMap, type SubmitDraft,
} from './model';

type Step = 'form' | 'review';

export function RequestSubmitPage() {
  const { t, name } = useTr();
  const { can } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const typeCode = params.get('type') ?? '';
  const allowed = can('requests.create');

  const types = useQuery({ queryKey: ['request-types', 'web'], queryFn: () => api.get<RequestTypeDto[]>('/request-types'), enabled: allowed });
  const offered = useMemo(() => webTypes(types.data ?? []), [types.data]);
  const picked = offered.find((x) => x.code === typeCode);

  const choose = (code: string) => router.push(code ? `/requests/new?type=${encodeURIComponent(code)}` : '/requests/new');

  return (
    <Page testId="page-request-new" width="narrow">
      <PageHeader
        title={picked ? name(picked) : t('requests.submit.title')}
        subtitle={picked ? undefined : t('requests.submit.subtitle')}
        back={{ href: '/requests', label: t('requests.submit.back') }}
      />
      {!allowed ? (
        <Banner tone="warning">{t('requests.submit.noPermission')}</Banner>
      ) : types.isLoading ? (
        <LoadingBlock />
      ) : types.isError ? (
        <ErrorBlock message={(types.error as Error).message} onRetry={() => void types.refetch()} />
      ) : picked ? (
        <SubmitForm key={picked.id} type={picked} onChangeType={() => choose('')} />
      ) : offered.length === 0 ? (
        <EmptyState icon={<Icon as={FilePlus2} size={24} />} title={t('requests.submit.noTypes')} />
      ) : (
        <TypePicker types={offered} onPick={choose} />
      )}
    </Page>
  );
}

function TypePicker({ types, onPick }: { types: RequestTypeDto[]; onPick: (code: string) => void }) {
  const { t, name } = useTr();
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold text-ink">{t('requests.submit.pickType')}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {types.map((x) => (
          <button
            key={x.id}
            type="button"
            data-testid={`submit-type-${x.code}`}
            onClick={() => onPick(x.code)}
            className="rounded-lg border border-hairline bg-surface p-4 text-start transition-colors hover:border-ink-3 hover:bg-surface-2 focus:outline-none focus:ring-2 focus:ring-focus/25"
          >
            <span className="block font-semibold text-ink">{name(x)}</span>
            <span className="code mt-1 block text-xs text-ink-3">{x.code}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function SubmitForm({ type, onChangeType }: { type: RequestTypeDto; onChangeType: () => void }) {
  const { t, name } = useTr();
  const router = useRouter();
  const toast = useToast();
  const detail = useQuery({ queryKey: ['request-types', type.id], queryFn: () => api.get<RequestTypeDto>(`/request-types/${type.id}`) });
  const cats = useMemo(() => activeCategories(detail.data?.lineCategories), [detail.data]);

  const seq = useRef(1);
  const clientKey = useRef(typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `web-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const [draft, setDraft] = useState<SubmitDraft>({ header: {}, lines: type.hasLines ? [newLine('l1')] : [] });
  const [issues, setIssues] = useState<IssueMap>({});
  const [step, setStep] = useState<Step>('form');
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  if (detail.isLoading) return <LoadingBlock />;
  if (detail.isError || !detail.data) return <ErrorBlock message={detail.error ? (detail.error as Error).message : t('requests.submit.loadFailed')} onRetry={() => void detail.refetch()} />;

  const fields = sortedFields(type.headerFields);
  const catById = new Map<string, LineCategoryDto>(cats.map((c) => [c.id, c]));
  const setLine = (i: number, next: SubmitDraft['lines'][number]) => setDraft((d) => ({ ...d, lines: d.lines.map((l, j) => (j === i ? next : l)) }));

  const review = () => {
    const found = validateDraft(type, cats, draft);
    setIssues(found);
    setServerError(null);
    if (Object.keys(found).length === 0) setStep('review');
  };

  const submit = async () => {
    // re-check: the draft could not change on the review step, but never post an invalid body
    const found = validateDraft(type, cats, draft);
    if (Object.keys(found).length) {
      setIssues(found);
      setStep('form');
      return;
    }
    setBusy(true);
    setServerError(null);
    try {
      const r = await api.post<{ id: string; number: string }>('/requests', buildCreateBody(type, cats, draft, clientKey.current));
      toast.success(t('requests.submit.success', { number: r.number }));
      router.push(`/requests/${r.id}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const details = e instanceof ApiError && Array.isArray(e.details) ? (e.details as unknown[]).filter((x): x is string => typeof x === 'string') : [];
      const mapped: IssueMap = {};
      for (const m of details.length ? details : [msg]) {
        const k = issueKeyFromServer(m);
        if (k) mapped[k] = { code: 'required' };
      }
      if (Object.keys(mapped).length) {
        setIssues(mapped);
        setStep('form');
      }
      setServerError(msg);
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  const total = draftTotal(draft.lines);
  const steps = [
    { key: 'form', label: t('requests.submit.step.form') },
    { key: 'review', label: t('requests.submit.step.review') },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs items={steps} value={step} onChange={() => undefined} />
        <Button variant="ghost" size="sm" onClick={onChangeType}>
          {t('requests.submit.changeType')}
        </Button>
      </div>

      {serverError && <Banner tone="danger">{serverError}</Banner>}

      {step === 'form' ? (
        <>
          {Object.keys(issues).length > 0 && <Banner tone="warning">{t('requests.submit.fix')}</Banner>}
          {fields.length > 0 && (
            <Card title={t('requests.submit.header.title')}>
              <div className="grid gap-4 sm:grid-cols-2">
                {fields.map((f) => (
                  <FieldInput
                    key={f.key}
                    field={f}
                    value={draft.header[f.key] ?? ''}
                    issue={issues[headerKey(f.key)]}
                    testId={`submit-field-${f.key}`}
                    onChange={(v) => setDraft((d) => ({ ...d, header: { ...d.header, [f.key]: v } }))}
                  />
                ))}
              </div>
            </Card>
          )}

          {type.hasLines && (
            <>
          <h2 className="text-lg font-semibold text-ink">{t('requests.submit.lines.title')}</h2>
          {issues.lines && <p role="alert" className="text-sm font-medium text-danger">{t('requests.submit.err.noLines')}</p>}
          {draft.lines.map((l, i) => (
            <LineEditor
              key={l.uid}
              index={i}
              line={l}
              categories={cats}
              issues={issues}
              canRemove={draft.lines.length > 1}
              onChange={(n) => setLine(i, n)}
              onRemove={() => setDraft((d) => ({ ...d, lines: d.lines.filter((_, j) => j !== i) }))}
            />
          ))}
          <Button
            variant="secondary"
            icon={<Icon as={Plus} />}
            data-testid="submit-line-add"
            onClick={() => {
              seq.current += 1;
              setDraft((d) => ({ ...d, lines: [...d.lines, newLine(`l${seq.current}`)] }));
            }}
          >
            {t('requests.submit.line.add')}
          </Button>

          <Card accent="rule">
            <div className="flex items-center justify-between gap-3">
              <span className="font-semibold text-ink">{t('requests.submit.total')}</span>
              <Money value={total} size="lg" />
            </div>
          </Card>
            </>
          )}
          <div className="flex justify-end">
            <Button data-testid="submit-next" onClick={review}>
              {t('requests.submit.next')}
            </Button>
          </div>
        </>
      ) : (
        <>
          <Card title={t('requests.submit.review.title')}>
            <DL cols={2}>
              {fields.map((f) => (
                <DLItem key={f.key} label={name({ nameAr: f.labelAr, nameEn: f.labelEn })}>
                  {draft.header[f.key]?.trim() ? <FieldValue field={f} value={draft.header[f.key].trim()} /> : <span className="text-ink-3">{t('requests.submit.review.empty')}</span>}
                </DLItem>
              ))}
            </DL>
          </Card>
          {type.hasLines && draft.lines.map((l, i) => {
            const c = catById.get(l.categoryId);
            return (
              <Card key={l.uid} title={`${t('requests.submit.line.n', { n: i + 1 })} - ${c ? name(c) : ''}`} actions={<Money value={l.amount ? draftTotal([l]) : '0'} />}>
                <DL cols={2}>
                  {sortedFields(c?.extraFields ?? [])
                    .filter((f) => l.extra[f.key]?.trim())
                    .map((f) => (
                      <DLItem key={f.key} label={name({ nameAr: f.labelAr, nameEn: f.labelEn })}>
                        <FieldValue field={f} value={l.extra[f.key].trim()} />
                      </DLItem>
                    ))}
                  <DLItem label={t('requests.submit.line.files')}>{l.files.map((f) => f.name).join(', ') || t('requests.submit.review.empty')}</DLItem>
                </DL>
              </Card>
            );
          })}
          {type.hasLines && (
          <Card accent="rule">
            <div className="flex items-center justify-between gap-3">
              <span className="font-semibold text-ink">{t('requests.submit.total')}</span>
              <Money value={total} size="lg" />
            </div>
          </Card>
          )}
          <div className="flex justify-between gap-2">
            <Button variant="secondary" disabled={busy} onClick={() => setStep('form')}>
              {t('requests.submit.edit')}
            </Button>
            <Button data-testid="submit-confirm" loading={busy} icon={<Icon as={Check} />} onClick={() => void submit()}>
              {t('requests.submit.confirm')}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
