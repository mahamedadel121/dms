'use client';

import { Fragment, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, BellOff, CheckCheck, ChevronRight } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';
import type { Paged } from '@/lib/types';
import { Button, Card, Checkbox, DateText, EmptyState, ErrorBlock, Icon, Page, PageHeader, Pagination, SkeletonRows } from '@/components/ui';
import { notificationLink, notificationText, type NotificationDto } from '@/components/layout/NotificationsBell';
import { groupByDay } from '@/features/common/groupByDay';

const PAGE_SIZE = 20;

export default function NotificationsPage() {
  const { t, locale } = useT();
  const router = useRouter();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [unread, setUnread] = useState(false);

  const list = useQuery({
    queryKey: ['notifications', 'page', page, unread],
    queryFn: () => api.get<Paged<NotificationDto>>('/notifications', { page, pageSize: PAGE_SIZE, unread: unread ? 1 : undefined }),
    placeholderData: (p) => p,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ['notifications'] });
  const readOne = useMutation({ mutationFn: (id: string) => api.post(`/notifications/${id}/read`), onSuccess: refresh });
  const readAll = useMutation({ mutationFn: () => api.post('/notifications/read-all'), onSuccess: refresh });

  const groups = useMemo(() => groupByDay(list.data?.items ?? [], (n) => n.createdAt), [list.data]);

  return (
    <Page testId="page-notifications" width="narrow">
      <PageHeader
        title={t('shell.page.notifications')}
        actions={
          <>
            <Checkbox label={t('common.notif.unreadOnly')} checked={unread} onChange={(c) => { setUnread(c); setPage(1); }} />
            <Button variant="secondary" icon={<Icon as={CheckCheck} size={16} />} loading={readAll.isPending} onClick={() => readAll.mutate()}>
              {t('shell.notif.markAll')}
            </Button>
          </>
        }
      />
      {list.isLoading && <SkeletonRows rows={6} cols={1} />}
      {list.error && <ErrorBlock message={errorMessage(list.error)} onRetry={() => void list.refetch()} />}
      {list.data && list.data.items.length === 0 && (
        <Card>
          <EmptyState icon={<Icon as={BellOff} size={24} />} title={t('shell.notif.empty')} />
        </Card>
      )}
      {groups.map((g) => (
        <section key={g.day} className="animate-rise">
          <h2 className="mb-2 px-1 text-sm font-medium text-ink-2">
            <DateText value={g.items[0]?.createdAt} mode="long" />
          </h2>
          <Card padded={false}>
            <ul className="divide-y divide-hairline">
              {g.items.map((n) => {
                const { title, body } = notificationText(n, locale);
                const link = notificationLink(n);
                return (
                  <Fragment key={n.id}>
                    <li>
                      <button
                        type="button"
                        data-testid="notification-row"
                        data-unread={n.readAt ? 'false' : 'true'}
                        className="flex w-full items-start gap-3 px-4 py-3 text-start hover:bg-surface-2"
                        onClick={() => {
                          if (!n.readAt) readOne.mutate(n.id);
                          if (link) router.push(link);
                        }}
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-2">
                          <Icon as={Bell} size={16} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            {!n.readAt && <span className="h-2 w-2 shrink-0 rounded-full bg-brass" aria-hidden />}
                            {title && <span className={cn('text-sm text-ink', !n.readAt && 'font-medium')}>{title}</span>}
                          </span>
                          <span className="block text-sm text-ink-2">{body}</span>
                          <DateText value={n.createdAt} mode="relative" className="mt-0.5 block text-xs text-ink-3" />
                        </span>
                        {link && <Icon as={ChevronRight} size={16} mirror className="mt-1.5 text-ink-3" />}
                      </button>
                    </li>
                  </Fragment>
                );
              })}
            </ul>
          </Card>
        </section>
      ))}
      {list.data && list.data.total > PAGE_SIZE && <Pagination page={page} pageSize={PAGE_SIZE} total={list.data.total} onPageChange={setPage} />}
    </Page>
  );
}
