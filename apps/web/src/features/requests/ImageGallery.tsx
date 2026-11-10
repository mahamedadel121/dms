'use client';

import { useState, type ReactNode } from 'react';
import { useTr } from '../common/useTr';
import type { AttachmentDto } from '../types';
import { EvidenceViewer } from './EvidenceViewer';
import type { EvidenceItem } from './evidence';

interface Props {
  attachments: AttachmentDto[];
  /** optional per-image extra control (e.g. "request correction on this image") */
  renderActions?: (a: AttachmentDto) => ReactNode;
}

/** Standalone gallery: a carousel EvidenceViewer over a flat list of attachments (no line context). */
export function ImageGallery({ attachments, renderActions }: Props) {
  const { t } = useTr();
  const [active, setActive] = useState<string | null>(attachments[0]?.id ?? null);
  if (attachments.length === 0) return <p className="text-sm text-ink-3">{t('requests.gallery.none')}</p>;
  const items: EvidenceItem[] = attachments.map((attachment) => ({ attachment, lineId: '', lineNo: 0, lineLabel: '' }));
  return (
    <EvidenceViewer
      items={items}
      activeId={active}
      onActiveChange={setActive}
      variant="carousel"
      renderActions={renderActions ? (it) => renderActions(it.attachment) : undefined}
    />
  );
}
