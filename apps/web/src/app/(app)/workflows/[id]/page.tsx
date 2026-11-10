'use client';

import { use } from 'react';
import { WorkflowEditorPage } from '@/features/workflows/WorkflowEditorPage';

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <WorkflowEditorPage id={id} />;
}
