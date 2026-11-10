'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Badge, Button, Card, Code, EmptyState, ErrorBlock, Page, PageHeader, Skeleton, StatusChip } from '@/components/ui';
import { useTr } from '../common/useTr';
import type { PagedResult, WorkflowDto } from '../types';

type WorkflowRow = Omit<WorkflowDto, 'versions'> & { activeVersion?: number | null };

export function WorkflowsListPage() {
  const { t, locale } = useTr();
  const q = useQuery({
    queryKey: ['workflows'],
    queryFn: async () => {
      const r = await api.get<PagedResult<WorkflowRow> | WorkflowRow[]>('/workflows');
      return Array.isArray(r) ? r : r.items;
    },
  });
  const rows = q.data ?? [];
  return (
    <Page testId="page-workflows">
      <PageHeader title={t('workflows.title')} subtitle={t('workflows.subtitle')} />
      {q.isError && <ErrorBlock message={(q.error as Error).message} onRetry={() => q.refetch()} />}
      {q.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-36 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState />
        </Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((w) => (
            <li key={w.id}>
              <Card className="h-full">
                <div data-testid="workflow-card" className="flex h-full flex-col gap-3">
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold text-ink">{locale === 'ar' ? w.nameAr : w.nameEn || w.nameAr}</h3>
                    <Code className="text-xs text-ink-3">{w.requestTypeCode}</Code>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {w.activeVersion ? (
                      <StatusChip kind="version" status="ACTIVE" label={`v${w.activeVersion}`} />
                    ) : (
                      <Badge tone="gray">{t('workflows.noActiveVersion')}</Badge>
                    )}
                    {!w.isActive && <Badge tone="gray">{t('common.inactive')}</Badge>}
                  </div>
                  <div className="mt-auto">
                    <Link href={`/workflows/${w.id}`}>
                      <Button variant="secondary" size="sm" tabIndex={-1}>
                        {t('workflows.open')}
                      </Button>
                    </Link>
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
