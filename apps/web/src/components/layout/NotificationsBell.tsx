'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';
import { useMediaQuery } from '@/lib/useMediaQuery';
import { DateText, Icon, IconButton, Popover } from '@/components/ui';
import type { Paged } from '@/lib/types';

export interface NotificationDto {
  id: string;
  type: string;
  titleAr?: string | null;
  titleEn?: string | null;
  bodyAr: string;
  bodyEn?: string | null;
  requestId?: string | null;
  data?: { link?: string; requestNumber?: string } | null;
  readAt: string | null;
  createdAt: string;
}

/** `GET /notifications` may return a plain array or the paged envelope. */
export function notificationItems(res: NotificationDto[] | Paged<NotificationDto> | undefined): NotificationDto[] {
  if (!res) return [];
  return Array.isArray(res) ? res : res.items;
}

export function notificationText(n: NotificationDto, locale: 'ar' | 'en'): { title: string; body: string } {
  const title = (locale === 'ar' ? n.titleAr ?? n.titleEn : n.titleEn ?? n.titleAr) ?? '';
  const body = (locale === 'ar' ? n.bodyAr : n.bodyEn || n.bodyAr) ?? '';
  return { title, body };
}

export function notificationLink(n: NotificationDto): string | null {
  if (n.data?.link) return n.data.link.startsWith('/') ? n.data.link : null;
  return n.requestId ? `/requests/${n.requestId}` : null;
}

export function NotificationsBell() {
  const { t, locale } = useT();
  const qc = useQueryClient();
  const router = useRouter();
  const small = useMediaQuery('(max-width: 639px)');
  const [open, setOpen] = useState(false);

  const count = useQuery({
    queryKey: ['notifications', 'count'],
    queryFn: () => api.get<{ count: number }>('/notifications/unread-count'),
    refetchInterval: 30_000,
  });
  const list = useQuery({
    queryKey: ['notifications', 'recent'],
    queryFn: () => api.get<NotificationDto[] | Paged<NotificationDto>>('/notifications', { pageSize: 8 }),
    enabled: open && !small,
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['notifications'] });
  const readOne = useMutation({ mutationFn: (id: string) => api.post(`/notifications/${id}/read`), onSuccess: invalidate });
  const readAll = useMutation({ mutationFn: () => api.post('/notifications/read-all'), onSuccess: invalidate });

  const unread = count.data?.count ?? 0;
  const items = notificationItems(list.data).slice(0, 8);

  const trigger = (
    <span className="relative inline-flex">
      <IconButton
        data-testid="notif-bell"
        icon={<Icon as={Bell} />}
        label={t('shell.notif.title')}
        onClick={small ? () => router.push('/notifications') : undefined}
      />
      {unread > 0 && (
        <span
          data-testid="notif-count"
          className="num pointer-events-none absolute -end-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-medium text-on-danger"
        >
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </span>
  );

  if (small) return trigger;

  return (
    <Popover open={open} onOpenChange={setOpen} align="end" className="w-[360px] max-w-[calc(100vw-2rem)] p-0" testId="notif-panel" trigger={trigger}>
      <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
        <span className="text-sm font-semibold text-ink">{t('shell.notif.title')}</span>
        {unread > 0 && (
          <button type="button" className="text-xs font-medium text-link hover:underline" onClick={() => readAll.mutate()}>
            {t('shell.notif.markAll')}
          </button>
        )}
      </div>
      <ul className="max-h-96 divide-y divide-hairline overflow-y-auto">
        {items.length === 0 && <li className="px-4 py-8 text-center text-sm text-ink-3">{t('shell.notif.empty')}</li>}
        {items.map((n) => {
          const { title, body } = notificationText(n, locale);
          const link = notificationLink(n);
          return (
            <li key={n.id}>
              <button
                type="button"
                className="flex w-full items-start gap-2.5 px-4 py-3 text-start hover:bg-surface-2"
                onClick={() => {
                  if (!n.readAt) readOne.mutate(n.id);
                  setOpen(false);
                  if (link) router.push(link);
                }}
              >
                <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.readAt ? 'bg-transparent' : 'bg-brass')} />
                <span className="min-w-0 flex-1">
                  {title && <span className={cn('block text-sm text-ink', !n.readAt && 'font-medium')}>{title}</span>}
                  <span className={cn('line-clamp-2 text-sm text-ink-2', !n.readAt && !title && 'font-medium')}>{body}</span>
                  <DateText value={n.createdAt} mode="relative" className="mt-0.5 block text-xs text-ink-3" />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <Link href="/notifications" onClick={() => setOpen(false)} className="block border-t border-hairline px-4 py-2.5 text-center text-sm font-medium text-link hover:bg-surface-2">
        {t('shell.notif.viewAll')}
      </Link>
    </Popover>
  );
}
