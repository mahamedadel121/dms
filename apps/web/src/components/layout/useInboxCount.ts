'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

interface Counter {
  count: number;
  overdue?: number;
}

/** Sum of the inbox queue counters (shared by the sidebar badge and the mobile tab bar). */
export function useInboxCount(): { count: number; overdue: number } {
  const { can } = useAuth();
  const q = useQuery({
    queryKey: ['queue-counters'],
    queryFn: () => api.get<Counter[]>('/requests/queue/counters'),
    refetchInterval: 30_000,
    enabled: can('requests.view'),
  });
  const rows = q.data ?? [];
  return { count: rows.reduce((s, r) => s + (r.count ?? 0), 0), overdue: rows.reduce((s, r) => s + (r.overdue ?? 0), 0) };
}
