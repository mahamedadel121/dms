import { describe, expect, it } from 'vitest';
import {
  EXPENSE_RESERVED_HEADER_KEYS,
  fieldDefinitionIssues,
  lineCategoryInputSchema,
  lineCategoryOrderSchema,
  templateCreateSchema,
  templateUpdateSchema,
} from './workflow';
import { sapRetryBodySchema } from './integrations';
import type { FieldDefinition } from '../schemas';

const f = (over: Partial<FieldDefinition> & { key: string }): FieldDefinition =>
  ({ type: 'text', labelAr: 'ح', labelEn: 'F', required: false, ...over }) as FieldDefinition;

const catBase = { code: 'FUEL', nameAr: 'وقود', nameEn: 'Fuel' };

describe('workflow contracts (phase 2)', () => {
  it('templateCreateSchema applies defaults', () => {
    const r = templateCreateSchema.parse({ requestTypeId: 'rt1', code: 'MAIN', nameAr: 'أ', nameEn: 'A' });
    expect(r.layoutKey).toBe('generic-request');
    expect(r.isDefault).toBe(false);
  });
  it('templateCreateSchema rejects a lowercase code', () => {
    expect(templateCreateSchema.safeParse({ requestTypeId: 'rt1', code: 'main', nameAr: 'أ', nameEn: 'A' }).success).toBe(false);
  });
  it('templateCreateSchema rejects an unknown layoutKey', () => {
    expect(
      templateCreateSchema.safeParse({ requestTypeId: 'rt1', code: 'MAIN', nameAr: 'أ', nameEn: 'A', layoutKey: 'nope' }).success,
    ).toBe(false);
  });
  it('templateUpdateSchema rejects an empty object', () => {
    expect(templateUpdateSchema.safeParse({}).success).toBe(false);
  });
  it('templateUpdateSchema accepts a single flag', () => {
    expect(templateUpdateSchema.safeParse({ isActive: false }).success).toBe(true);
  });
  it('lineCategoryInputSchema accepts a subset of mime types', () => {
    const r = lineCategoryInputSchema.safeParse({ ...catBase, allowedMimeTypes: ['image/jpeg', 'application/pdf'] });
    expect(r.success).toBe(true);
  });
  it('lineCategoryInputSchema rejects an unknown mime type', () => {
    expect(lineCategoryInputSchema.safeParse({ ...catBase, allowedMimeTypes: ['image/gif'] }).success).toBe(false);
  });
  it('lineCategoryInputSchema rejects an empty mime list', () => {
    expect(lineCategoryInputSchema.safeParse({ ...catBase, allowedMimeTypes: [] }).success).toBe(false);
  });
  it('lineCategoryOrderSchema rejects an empty id list', () => {
    expect(lineCategoryOrderSchema.safeParse({ ids: [] }).success).toBe(false);
  });
  it('sapRetryBodySchema defaults to an empty object', () => {
    expect(sapRetryBodySchema.parse(undefined)).toEqual({});
  });
  it('sapRetryBodySchema keeps force', () => {
    expect(sapRetryBodySchema.parse({ force: true })).toEqual({ force: true });
  });

  describe('fieldDefinitionIssues', () => {
    it('returns nothing for a clean list', () => {
      expect(fieldDefinitionIssues([f({ key: 'notes' }), f({ key: 'amount', type: 'number', min: 1, max: 5 })])).toEqual([]);
    });
    it('flags a bad key format', () => {
      expect(fieldDefinitionIssues([f({ key: 'Bad-Key' })]).map((i) => i.code)).toContain('KEY_FORMAT');
    });
    it('flags duplicates', () => {
      const r = fieldDefinitionIssues([f({ key: 'a' }), f({ key: 'a' })]);
      expect(r).toEqual([{ index: 1, key: 'a', code: 'KEY_DUPLICATE' }]);
    });
    it('flags reserved keys', () => {
      const r = fieldDefinitionIssues([f({ key: 'vehicleId' })], EXPENSE_RESERVED_HEADER_KEYS);
      expect(r.map((i) => i.code)).toEqual(['KEY_RESERVED']);
    });
    it('requires options for select', () => {
      expect(fieldDefinitionIssues([f({ key: 's', type: 'select' })]).map((i) => i.code)).toEqual(['OPTIONS_REQUIRED']);
    });
    it('requires a lookup entity', () => {
      expect(fieldDefinitionIssues([f({ key: 'l', type: 'lookup' })]).map((i) => i.code)).toEqual(['LOOKUP_REQUIRED']);
    });
    it('flags min greater than max', () => {
      expect(fieldDefinitionIssues([f({ key: 'n', type: 'number', min: 9, max: 1 })]).map((i) => i.code)).toEqual(['MIN_GT_MAX']);
    });
    it('flags an invalid regex', () => {
      expect(fieldDefinitionIssues([f({ key: 'r', regex: '(' })]).map((i) => i.code)).toEqual(['REGEX_INVALID']);
    });
  });
});
