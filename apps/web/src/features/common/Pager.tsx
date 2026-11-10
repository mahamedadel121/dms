'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useTr } from './useTr';

export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const { t } = useTr();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return <p className="mt-2 text-xs text-slate-500">{t('common.rowsTotal', { n: total })}</p>;
  return (
    <div className="mt-3 flex items-center justify-between gap-2">
      <span className="text-xs text-slate-500">{t('common.rowsTotal', { n: total })}</span>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="prev">
          <ChevronRight className="h-4 w-4 rtl:rotate-0 ltr:rotate-180" />
        </Button>
        <span className="text-sm tabular-nums">
          {page} / {pages}
        </span>
        <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="next">
          <ChevronLeft className="h-4 w-4 rtl:rotate-0 ltr:rotate-180" />
        </Button>
      </div>
    </div>
  );
}
