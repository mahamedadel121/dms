'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Badge, Card, EmptyState, ErrorBlock, LoadingBlock, PageHeader } from '@/components/ui/Display';
import { useTr } from '../common/useTr';
import type { PagedResult, WorkflowDto } from '../types';

export function WorkflowsListPage() {
  const { t, locale } = useTr();
  const q = useQuery({
    queryKey: ['workflows'],
    queryFn: async () => {
      const r = await api.get<PagedResult<WorkflowDto> | WorkflowDto[]>('/workflows');
      return Array.isArray(r) ? r : r.items;
    },
  });
  return (
    <div>
      <PageHeader title={t('workflows.title')} subtitle={t('workflows.subtitle')} />
      {q.isError && <ErrorBlock message={(q.error as Error).message} />}
      {q.isLoading ? (
        <LoadingBlock />
      ) : (q.data ?? []).length === 0 ? (
        <Card>
          <EmptyState />
        </Card>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(q.data ?? []).map((w) => {
            const active = w.versions?.find((v) => v.status === 'ACTIVE');
            const draft = w.versions?.find((v) => v.status === 'DRAFT');
            return (
              <li key={w.id}>
                <Link href={`/workflows/${w.id}`} className="block rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-brand-500">
                  <h3 className="font-bold text-slate-900">{locale === 'ar' ? w.nameAr : w.nameEn || w.nameAr}</h3>
                  <p className="text-xs text-slate-500">{w.requestTypeCode}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {active && <Badge tone="green">{t('workflows.activeVersion', { n: active.version })}</Badge>}
                    {draft && <Badge tone="amber">{t('workflows.draftVersion', { n: draft.version })}</Badge>}
                    {!w.isActive && <Badge>{t('common.inactive')}</Badge>}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
