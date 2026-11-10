'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';
import { formatDateTime } from '@/lib/format';
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
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const count = useQuery({
    queryKey: ['notifications', 'count'],
    queryFn: () => api.get<{ count: number }>('/notifications/unread-count'),
    refetchInterval: 30_000,
  });
  const list = useQuery({
    queryKey: ['notifications', 'recent'],
    queryFn: () => api.get<NotificationDto[] | Paged<NotificationDto>>('/notifications', { pageSize: 8 }),
    enabled: open,
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['notifications'] });
  const readOne = useMutation({ mutationFn: (id: string) => api.post(`/notifications/${id}/read`), onSuccess: invalidate });
  const readAll = useMutation({ mutationFn: () => api.post('/notifications/read-all'), onSuccess: invalidate });

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const unread = count.data?.count ?? 0;
  const items = notificationItems(list.data);

  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-full p-2 text-slate-600 hover:bg-slate-100"
        aria-label={t('common.notif.title')}
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -end-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute end-0 z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
            <span className="text-sm font-bold">{t('common.notif.title')}</span>
            {unread > 0 && (
              <button type="button" className="text-xs font-semibold text-brand-700 hover:underline" onClick={() => readAll.mutate()}>
                {t('common.notif.markAll')}
              </button>
            )}
          </div>
          <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto">
            {items.length === 0 && <li className="px-3 py-8 text-center text-sm text-slate-500">{t('common.notif.empty')}</li>}
            {items.map((n) => {
              const { title, body } = notificationText(n, locale);
              const link = notificationLink(n);
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    className={cn('block w-full px-3 py-2 text-start hover:bg-slate-50', !n.readAt && 'bg-sky-50/60')}
                    onClick={() => {
                      if (!n.readAt) readOne.mutate(n.id);
                      setOpen(false);
                      if (link) router.push(link);
                    }}
                  >
                    {title && <p className="text-sm font-semibold text-slate-900">{title}</p>}
                    <p className="line-clamp-2 text-sm text-slate-700">{body}</p>
                    <p className="mt-0.5 text-xs text-slate-400">{formatDateTime(n.createdAt)}</p>
                  </button>
                </li>
              );
            })}
          </ul>
          <Link href="/notifications" onClick={() => setOpen(false)} className="block border-t border-slate-100 px-3 py-2 text-center text-sm font-semibold text-brand-700 hover:bg-slate-50">
            {t('common.notif.viewAll')}
          </Link>
        </div>
      )}
    </div>
  );
}
