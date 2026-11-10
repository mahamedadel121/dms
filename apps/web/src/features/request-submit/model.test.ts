import { describe, expect, it } from 'vitest';
import type { FieldDefinition, LineCategoryDto, RequestTypeDto } from '@dms/shared';
import { buildCreateBody, checkFile, draftTotal, headerKey, issueKeyFromServer, newLine, validateDraft, validateFields, webTypes, type SubmitDraft } from './model';

const f = (over: Partial<FieldDefinition>): FieldDefinition => ({ key: 'k', labelAr: 'ك', labelEn: 'K', type: 'text', required: false, order: 1, ...over });
const cat = (over: Partial<LineCategoryDto> = {}): LineCategoryDto => ({
  id: 'c1', requestTypeId: 't1', code: 'ITEM', nameAr: 'بند', nameEn: 'Item', icon: null, sortOrder: 0, isActive: true, extraFields: [], quantityFieldKey: null,
  unitPriceMin: null, unitPriceMax: null, minAttachments: 1, maxAttachments: 2, maxAmountWarning: null, approvalRoleIds: [], allowedMimeTypes: ['image/png'], ...over,
});
const type = (over: Partial<RequestTypeDto> = {}): RequestTypeDto => ({
  id: 't1', code: 'HR_LEAVE', nameAr: 'إجازة', nameEn: 'Leave', departmentId: null, numberPrefix: 'HL', moduleKey: null, hasLines: true, channels: ['WEB'], settings: {},
  isActive: true, workflowId: 'w1', headerFields: [f({ key: 'reason', required: true }), f({ key: 'days', type: 'number', min: 1, max: 30, order: 2 })], ...over,
});
const file = { id: 'a1', name: 'a.png', mimeType: 'image/png' };

describe('request-submit model', () => {
  it('webTypes keeps active WEB types with lines', () => {
    const r = webTypes([type(), type({ code: 'X', channels: ['TELEGRAM'] }), type({ code: 'Y', isActive: false }), type({ code: 'Z', hasLines: false })]);
    expect(r.map((x) => x.code)).toEqual(['HR_LEAVE']);
  });

  it('validateFields mirrors the engine rules', () => {
    const fields = [
      f({ key: 'n', type: 'number', min: 1, max: 5 }),
      f({ key: 's', type: 'select', options: [{ value: 'a', labelAr: 'أ', labelEn: 'A' }] }),
      f({ key: 'd', type: 'date' }),
      f({ key: 'r', regex: '^[A-Z]+$' }),
      f({ key: 'q', required: true }),
    ];
    const e = validateFields(fields, { n: '9', s: 'b', d: '12/01', r: 'abc', q: ' ' }, headerKey);
    expect(e['h.n'].code).toBe('max');
    expect(e['h.s'].code).toBe('option');
    expect(e['h.d'].code).toBe('date');
    expect(e['h.r'].code).toBe('regex');
    expect(e['h.q'].code).toBe('required');
    expect(validateFields(fields, { n: '٣', q: 'x' }, headerKey)).toEqual({});
  });

  it('validateDraft checks amount, extra fields and attachment counts', () => {
    const c = cat({ extraFields: [f({ key: 'ref', required: true })] });
    const draft: SubmitDraft = {
      header: { reason: 'x' },
      lines: [
        { ...newLine('u1', 'c1'), amount: '0' },
        { ...newLine('u2', 'c1'), amount: '5', extra: { ref: 'r' }, files: [file, file, file] },
      ],
    };
    const e = validateDraft(type(), [c], draft);
    expect(e['l0.amount'].code).toBe('amount');
    expect(e['l0.ref'].code).toBe('required');
    expect(e['l0.files']).toEqual({ code: 'minFiles', params: { min: 1 } });
    expect(e['l1.files']).toEqual({ code: 'maxFiles', params: { max: 2 } });
    expect(validateDraft(type(), [c], { header: {}, lines: [] }).lines.code).toBe('noLines');
  });

  it('checkFile enforces mime type and max count', () => {
    const c = cat();
    expect(checkFile(c, 0, 'image/png')).toEqual({ ok: true });
    expect(checkFile(c, 0, 'application/pdf')).toEqual({ ok: false, code: 'type' });
    expect(checkFile(c, 2, 'image/png')).toEqual({ ok: false, code: 'max' });
  });

  it('draftTotal sums valid amounts and ignores bad ones', () => {
    expect(draftTotal([{ ...newLine('a'), amount: '10.5' }, { ...newLine('b'), amount: '٢٠' }, { ...newLine('c'), amount: 'x' }])).toBe('30.5');
  });

  it('buildCreateBody normalises numbers and drops empty values', () => {
    const c = cat({ extraFields: [f({ key: 'qty', type: 'number' })] });
    const body = buildCreateBody(
      type(),
      [c],
      { header: { reason: ' Family ', days: '٣', other: '' }, lines: [{ ...newLine('u', 'c1'), amount: '12.50', extra: { qty: '٢', z: '' }, files: [file], note: ' hi ' }] },
      'key-1',
    );
    expect(body).toEqual({
      requestTypeCode: 'HR_LEAVE',
      clientKey: 'key-1',
      headerValues: { reason: 'Family', days: 3 },
      lines: [{ categoryId: 'c1', amount: '12.50', extraValues: { qty: '2' }, attachmentIds: ['a1'], note: 'hi' }],
    });
  });

  it('issueKeyFromServer maps engine messages to form keys', () => {
    expect(issueKeyFromServer('header field "reason" is required')).toBe('h.reason');
    expect(issueKeyFromServer('line 2 field "ref" is required')).toBe('l1.ref');
    expect(issueKeyFromServer('something else')).toBeNull();
  });
});
