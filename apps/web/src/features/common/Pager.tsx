'use client';

import { Pagination } from '@/components/ui/DataTable';

/** Thin wrapper over the kit `Pagination` (kept for existing call sites). */
export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  return <Pagination page={page} pageSize={pageSize} total={total} onPageChange={onPage} />;
}
