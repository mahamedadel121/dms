import { describe, expect, it } from 'vitest';
import type { FieldDefinition, RequestTypeDto } from '@dms/shared';
import {
  EMPTY_TYPE_FORM,
  blankField,
  emptyCategoryForm,
  normalizeOrder,
  toCategoryInput,
  toTypeInput,
  toTypeUpdate,
  typeToForm,
  validateFields,
  validateType,
  type TypeForm,
} from './model';

const field = (over: Partial<FieldDefinition> = {}): FieldDefinition => ({
  key: 'area',
  labelAr: 'المنطقة',
  labelEn: 'Area',
  type: 'text',
  required: false,
  order: 0,
  ...over,
});

const original: RequestTypeDto = {
  id: 't1',
  code: 'DRIVER_EXPENSE',
  nameAr: 'مصروفات',
  nameEn: 'Expenses',
  departmentId: null,
  numberPrefix: 'DE',
  moduleKey: null,
  headerFields: [field()],
  hasLines: true,
  channels: ['TELEGRAM'],
  settings: {},
  isActive: true,
  workflowId: null,
};

describe('request-types model', () => {
  it('blankField gives a unique key', () => {
    const a = blankField([]);
    expect(a.key).toBe('field1');
    const b = blankField(['field1', 'field2']);
    expect(b.key).toBe('field3');
    const c = blankField(['field2']);
    expect(c.key).not.toBe('field2');
    expect(blankField(['x', 'field2']).key).toBe('field3');
    expect(blankField(['a', 'b']).order).toBe(20);
  });

  it('validateFields maps issues to rows', () => {
    const fields = [
      field({ key: 'ok' }),
      field({ key: '1bad', labelEn: '' }),
      field({ key: 'ok' }),
      field({ key: 'pick', type: 'select' }),
      field({ key: 'num', type: 'number', min: 5, max: 1 }),
      field({ key: 'odometer' }),
    ];
    const e = validateFields(fields, ['odometer']);
    expect(e[0]).toBeUndefined();
    expect(e[1]).toMatchObject({ key: 'rt.err.KEY_FORMAT', labelEn: 'rt.err.REQUIRED' });
    expect(e[2]).toMatchObject({ key: 'rt.err.KEY_DUPLICATE' });
    expect(e[3]).toMatchObject({ options: 'rt.err.OPTIONS_REQUIRED' });
    expect(e[4]).toMatchObject({ max: 'rt.err.MIN_GT_MAX' });
    expect(e[5]).toMatchObject({ key: 'rt.err.KEY_RESERVED' });
  });

  it('normalizeOrder rewrites order', () => {
    const out = normalizeOrder([field({ key: 'a', order: 7 }), field({ key: 'b', order: 3 }), field({ key: 'c', order: 99 })]);
    expect(out.map((f) => f.order)).toEqual([0, 10, 20]);
    expect(out.map((f) => f.key)).toEqual(['a', 'b', 'c']);
  });

  it('toTypeInput trims and uppercases', () => {
    const form: TypeForm = { ...EMPTY_TYPE_FORM, code: ' my_type ', numberPrefix: ' mt ', nameAr: ' ا ', nameEn: ' A ', moduleKey: '', departmentId: '' };
    const out = toTypeInput(form);
    expect(out.code).toBe('MY_TYPE');
    expect(out.numberPrefix).toBe('MT');
    expect(out.nameAr).toBe('ا');
    expect(out.nameEn).toBe('A');
    expect(out.moduleKey).toBeNull();
    expect(out.departmentId).toBeNull();
  });

  it('toTypeUpdate sends only changed keys', () => {
    const form = typeToForm(original);
    expect(toTypeUpdate(form, original)).toEqual({});
    expect(toTypeUpdate({ ...form, nameEn: 'Expenses 2', channels: ['TELEGRAM', 'WEB'] }, original)).toEqual({ nameEn: 'Expenses 2', channels: ['TELEGRAM', 'WEB'] });
    const withField = toTypeUpdate({ ...form, headerFields: [...form.headerFields, field({ key: 'zone' })] }, original);
    expect(Object.keys(withField)).toEqual(['headerFields']);
    expect(withField.headerFields?.map((f) => f.order)).toEqual([0, 10]);
  });

  it('toCategoryInput converts empty strings to null', () => {
    const form = { ...emptyCategoryForm(30), code: ' fuel ', nameAr: 'وقود', nameEn: 'Fuel' };
    const out = toCategoryInput(form);
    expect(out.code).toBe('FUEL');
    expect(out.icon).toBeNull();
    expect(out.quantityFieldKey).toBeNull();
    expect(out.unitPriceMin).toBeNull();
    expect(out.unitPriceMax).toBeNull();
    expect(out.maxAmountWarning).toBeNull();
    expect(out.sortOrder).toBe(30);
    expect(toCategoryInput({ ...form, unitPriceMax: ' 12.50 ' }).unitPriceMax).toBe('12.50');
  });

  it('validateType requires names, code, prefix and a channel', () => {
    const e = validateType({ ...EMPTY_TYPE_FORM, channels: [] });
    expect(Object.keys(e).sort()).toEqual(['channels', 'code', 'nameAr', 'nameEn', 'numberPrefix']);
    const ok = validateType({ ...EMPTY_TYPE_FORM, code: 'ABC', numberPrefix: 'AB', nameAr: 'ا', nameEn: 'A' });
    expect(ok).toEqual({});
    expect(validateType({ ...EMPTY_TYPE_FORM, code: 'a-b', numberPrefix: 'ABCDE', nameAr: 'ا', nameEn: 'A' })).toMatchObject({
      code: 'rt.err.CODE_FORMAT',
      numberPrefix: 'rt.err.PREFIX_FORMAT',
    });
    expect(validateType({ ...EMPTY_TYPE_FORM, nameAr: 'ا', nameEn: 'A' }, 'edit')).toEqual({});
  });
});
