'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCheck } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';
import { formatDateTime } from '@/lib/format';
import type { Paged } from '@/lib/types';
import { Badge, Button, Card, Checkbox, EmptyState, ErrorBlock, LoadingBlock, PageHeader, Pagination } from '@/components/ui';
import { notificationLink, notificationText, type NotificationDto } from '@/components/layout/NotificationsBell';

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

  return (
    <>
      <PageHeader
        title={t('common.notif.title')}
        actions={
          <>
            <Checkbox label={t('common.notif.unreadOnly')} checked={unread} onChange={(c) => { setUnread(c); setPage(1); }} />
            <Button variant="secondary" icon={<CheckCheck className="h-4 w-4" />} loading={readAll.isPending} onClick={() => readAll.mutate()}>
              {t('common.notif.markAll')}
            </Button>
          </>
        }
      />
      <Card padded={false}>
        {list.isLoading && <LoadingBlock />}
        {list.error && <div className="p-4"><ErrorBlock message={errorMessage(list.error)} /></div>}
        {list.data && list.data.items.length === 0 && <EmptyState title={t('common.notif.empty')} />}
        <ul className="divide-y divide-slate-100">
          {list.data?.items.map((n) => {
            const { title, body } = notificationText(n, locale);
            const link = notificationLink(n);
            return (
              <li key={n.id}>
                <button
                  type="button"
                  className={cn('block w-full px-4 py-3 text-start hover:bg-slate-50', !n.readAt && 'bg-sky-50/60')}
                  onClick={() => {
                    if (!n.readAt) readOne.mutate(n.id);
                    if (link) router.push(link);
                  }}
                >
                  <div className="flex items-center gap-2">
                    {title && <span className="font-semibold text-slate-900">{title}</span>}
                    {!n.readAt && <Badge tone="blue">{t('common.notif.unread')}</Badge>}
                    <span className="ms-auto text-xs text-slate-400">{formatDateTime(n.createdAt)}</span>
                  </div>
                  <p className="mt-0.5 text-sm text-slate-700">{body}</p>
                </button>
              </li>
            );
          })}
        </ul>
        {list.data && list.data.total > PAGE_SIZE && <Pagination page={page} pageSize={PAGE_SIZE} total={list.data.total} onPageChange={setPage} />}
      </Card>
    </>
  );
}
