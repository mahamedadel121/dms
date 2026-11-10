'use client';

import { use } from 'react';
import { RequestTypeEditorPage } from '@/features/request-types/RequestTypeEditorPage';

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <RequestTypeEditorPage id={id} />;
}
