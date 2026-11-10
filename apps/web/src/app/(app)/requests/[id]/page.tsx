'use client';

import { use } from 'react';
import { RequestDetailPage } from '@/features/requests/RequestDetailPage';

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <RequestDetailPage id={id} />;
}
