'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Badge, Card, EmptyState, ErrorBlock, LoadingBlock, PageHeader } from '@/components/ui/Display';
import { useTr } from '../common/useTr';
import type { PagedResult, TemplateDto } from '../types';

export function TemplatesListPage() {
  const { t, locale } = useTr();
  const q = useQuery({
    queryKey: ['templates'],
    queryFn: async () => {
      const r = await api.get<PagedResult<TemplateDto> | TemplateDto[]>('/templates');
      return Array.isArray(r) ? r : r.items;
    },
  });
  return (
    <div>
      <PageHeader title={t('templates.title')} subtitle={t('templates.subtitle')} />
      {q.isError && <ErrorBlock message={(q.error as Error).message} />}
      {q.isLoading ? (
        <LoadingBlock />
      ) : (q.data ?? []).length === 0 ? (
        <Card>
          <EmptyState />
        </Card>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(q.data ?? []).map((tp) => {
            const active = tp.versions?.find((v) => v.status === 'ACTIVE');
            const draft = tp.versions?.find((v) => v.status === 'DRAFT');
            return (
              <li key={tp.id}>
                <Link href={`/templates/${tp.id}`} className="block rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-brand-500">
                  <h3 className="font-bold text-slate-900">{locale === 'ar' ? tp.nameAr : tp.nameEn || tp.nameAr}</h3>
                  <p className="text-xs text-slate-500">{tp.code}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {tp.isDefault && <Badge tone="blue">{t('templates.default')}</Badge>}
                    {active && <Badge tone="green">{t('workflows.activeVersion', { n: active.version })}</Badge>}
                    {draft && <Badge tone="amber">{t('workflows.draftVersion', { n: draft.version })}</Badge>}
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
