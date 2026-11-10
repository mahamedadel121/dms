import type { AttachmentDto, LineDto } from '../types';
import { categoryLabel } from './helpers';

export interface EvidenceItem {
  attachment: AttachmentDto;
  lineId: string;
  lineNo: number;
  lineLabel: string;
}

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 5;

/** Current attachments only, ordered by line number then upload time. */
export function buildEvidence(lines: LineDto[], locale: 'ar' | 'en'): EvidenceItem[] {
  const out: EvidenceItem[] = [];
  for (const l of [...lines].sort((a, b) => a.lineNo - b.lineNo)) {
    const label = categoryLabel(l.category, locale);
    const atts = l.attachments.filter((a) => a.isCurrent).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    for (const a of atts) out.push({ attachment: a, lineId: l.id, lineNo: l.lineNo, lineLabel: label });
  }
  return out;
}

export function clampZoom(z: number): number {
  if (!Number.isFinite(z)) return 1;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

/** Next index in a ring of `n` items. */
export function nextIndex(i: number, n: number, dir: 1 | -1): number {
  if (n <= 0) return 0;
  return (((i + dir) % n) + n) % n;
}
