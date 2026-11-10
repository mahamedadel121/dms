'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { NAV } from '@/lib/nav';
import { LoadingBlock } from '@/components/ui/Display';

/** Sends the user to the first page their permissions allow. */
export default function Home() {
  const { me, loading, can } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (loading) return;
    if (!me) return router.replace('/login');
    const first = NAV.flatMap((g) => g.items).find((i) => can(i.permission));
    router.replace(first?.href ?? '/profile');
  }, [loading, me, can, router]);
  return <LoadingBlock />;
}
