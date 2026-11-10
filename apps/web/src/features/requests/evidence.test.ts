import { describe, expect, it } from 'vitest';
import { buildEvidence, clampZoom, nextIndex } from './evidence';
import type { AttachmentDto, LineDto } from '../types';

const att = (id: string, createdAt: string, isCurrent = true): AttachmentDto => ({
  id,
  url: `/files/${id}`,
  thumbUrl: null,
  mimeType: 'image/jpeg',
  isCurrent,
  supersededById: null,
  createdAt,
  duplicates: [],
});

const line = (lineNo: number, attachments: AttachmentDto[]): LineDto => {
  const cat = { id: `c${lineNo}`, code: `C${lineNo}`, nameAr: `ب${lineNo}`, nameEn: `Cat ${lineNo}` };
  return {
    id: `l${lineNo}`,
    lineNo,
    category: cat,
    originalCategory: cat,
    originalAmount: '10.00',
    amount: '10.00',
    isEdited: false,
    extraValues: {},
    quantity: null,
    unitPrice: null,
    lineDate: null,
    note: null,
    warnings: [],
    attachments,
    edits: [],
  };
};

describe('evidence', () => {
  it('orders by line then time', () => {
    const items = buildEvidence(
      [line(2, [att('b2', '2026-01-01T10:00:00Z')]), line(1, [att('a2', '2026-01-01T12:00:00Z'), att('a1', '2026-01-01T09:00:00Z')])],
      'en',
    );
    expect(items.map((i) => i.attachment.id)).toEqual(['a1', 'a2', 'b2']);
    expect(items[0]!.lineNo).toBe(1);
    expect(items[0]!.lineLabel).toBe('Cat 1');
    expect(buildEvidence([line(1, [att('x', '2026-01-01T00:00:00Z')])], 'ar')[0]!.lineLabel).toBe('ب1');
  });

  it('excludes superseded attachments', () => {
    const items = buildEvidence([line(1, [att('old', '2026-01-01T00:00:00Z', false), att('new', '2026-01-02T00:00:00Z')])], 'en');
    expect(items.map((i) => i.attachment.id)).toEqual(['new']);
  });

  it('clampZoom', () => {
    expect(clampZoom(0.1)).toBe(0.25);
    expect(clampZoom(9)).toBe(5);
    expect(clampZoom(1.5)).toBe(1.5);
    expect(clampZoom(Number.NaN)).toBe(1);
  });

  it('nextIndex wraps both ways', () => {
    expect(nextIndex(2, 3, 1)).toBe(0);
    expect(nextIndex(0, 3, -1)).toBe(2);
    expect(nextIndex(1, 3, 1)).toBe(2);
    expect(nextIndex(0, 0, 1)).toBe(0);
  });
});
