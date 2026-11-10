'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MoreHorizontal, Plus } from 'lucide-react';
import type { RequestTypeDto } from '@dms/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Badge, Button, Card, Code, EmptyState, ErrorBlock, Icon, IconButton, Menu, Page, PageHeader, Skeleton, StatusChip, useToast } from '@/components/ui';
import { useTr } from '../common/useTr';
import type { PagedResult, TemplateDto } from '../types';
import { CreateTemplateDialog } from './CreateTemplateDialog';

type TemplateRow = Omit<TemplateDto, 'versions'> & { activeVersion?: number | null };

export function TemplatesListPage() {
  const { t, locale } = useTr();
  const { can } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const qc = useQueryClient();
  const canManage = can('templates.manage');
  const [creating, setCreating] = useState(false);

  const q = useQuery({
    queryKey: ['templates'],
    queryFn: async () => {
      const r = await api.get<PagedResult<TemplateRow> | TemplateRow[]>('/templates');
      return Array.isArray(r) ? r : r.items;
    },
  });
  const types = useQuery({
    queryKey: ['request-types'],
    queryFn: async () => {
      const r = await api.get<RequestTypeDto[] | PagedResult<RequestTypeDto>>('/request-types');
      return Array.isArray(r) ? r : r.items;
    },
  });
  const typeName = (id: string) => {
    const r = types.data?.find((x) => x.id === id);
    return r ? (locale === 'ar' ? r.nameAr : r.nameEn || r.nameAr) : '';
  };

  const patch = useMutation({
    mutationFn: (v: { id: string; body: { isDefault?: boolean; isActive?: boolean } }) => api.patch(`/templates/${v.id}`, v.body),
    onSuccess: async () => {
      toast.success(t('templates.updated'));
      await qc.invalidateQueries({ queryKey: ['templates'] });
    },
    onError: (e) => toast.error(e),
  });

  const rows = q.data ?? [];
  return (
    <Page testId="page-templates">
      <PageHeader
        title={t('templates.title')}
        subtitle={t('templates.subtitle')}
        actions={
          canManage && (
            <Button data-testid="template-new" icon={<Icon as={Plus} size={16} />} onClick={() => setCreating(true)}>
              {t('templates.new')}
            </Button>
          )
        }
      />
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
          {rows.map((tp) => (
            <li key={tp.id}>
              <Card className="h-full">
                <div data-testid="template-card" className="flex h-full flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link href={`/templates/${tp.id}`} className="text-lg font-semibold text-ink hover:text-primary">
                        {locale === 'ar' ? tp.nameAr : tp.nameEn || tp.nameAr}
                      </Link>
                      <div>
                        <Code className="text-xs text-ink-3">{tp.code}</Code>
                      </div>
                      <p className="mt-1 text-sm text-ink-2">{typeName(tp.requestTypeId)}</p>
                    </div>
                    <Menu
                      align="end"
                      trigger={<IconButton icon={<Icon as={MoreHorizontal} size={18} />} label={t('templates.menu.more')} />}
                      items={[
                        { key: 'open', label: t('templates.menu.open'), onSelect: () => router.push(`/templates/${tp.id}`) },
                        { key: 'default', label: t('templates.menu.setDefault'), hidden: !canManage || tp.isDefault, onSelect: () => patch.mutate({ id: tp.id, body: { isDefault: true } }) },
                        {
                          key: 'active',
                          label: tp.isActive ? t('templates.menu.deactivate') : t('templates.menu.activate'),
                          hidden: !canManage || (tp.isDefault && tp.isActive),
                          onSelect: () => patch.mutate({ id: tp.id, body: { isActive: !tp.isActive } }),
                        },
                      ]}
                    />
                  </div>
                  <div className="mt-auto flex flex-wrap gap-2">
                    {tp.isDefault && <Badge tone="brass">{t('templates.default')}</Badge>}
                    {tp.activeVersion ? <StatusChip kind="version" status="ACTIVE" label={`v${tp.activeVersion}`} /> : <Badge tone="gray">{t('templates.noActive')}</Badge>}
                    {!tp.isActive && <Badge tone="gray">{t('templates.inactive')}</Badge>}
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
      <CreateTemplateDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(tp) => {
          setCreating(false);
          void qc.invalidateQueries({ queryKey: ['templates'] });
          router.push(`/templates/${tp.id}`);
        }}
      />
    </Page>
  );
}
