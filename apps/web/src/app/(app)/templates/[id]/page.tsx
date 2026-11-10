'use client';

import { use } from 'react';
import { TemplateEditorPage } from '@/features/templates/TemplateEditorPage';

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <TemplateEditorPage id={id} />;
}
