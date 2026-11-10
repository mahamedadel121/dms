import { describe, expect, it } from 'vitest';
import { diffObjects } from './diff';

describe('diffObjects', () => {
  it('added, removed and changed keys', () => {
    const d = diffObjects({ a: 1, b: 'x', c: true }, { a: 2, b: 'x', d: [1] });
    expect(d).toEqual([
      { key: 'a', before: '1', after: '2', kind: 'changed' },
      { key: 'c', before: 'true', after: undefined, kind: 'removed' },
      { key: 'd', before: undefined, after: '[1]', kind: 'added' },
    ]);
  });

  it('equal objects give nothing', () => {
    expect(diffObjects({ a: { n: 1 } }, { a: { n: 1 } })).toEqual([]);
  });

  it('handles null before or after', () => {
    expect(diffObjects(null, { a: 1 })).toEqual([{ key: 'a', before: undefined, after: '1', kind: 'added' }]);
    expect(diffObjects({ a: 1 }, null)).toEqual([{ key: 'a', before: '1', after: undefined, kind: 'removed' }]);
    expect(diffObjects(null, null)).toEqual([]);
  });

  it('recurses into nested objects with dotted paths', () => {
    const d = diffObjects({ a: { b: { c: 1, d: 2 }, e: 1 } }, { a: { b: { c: 2 }, f: 3 } });
    expect(d).toEqual([
      { key: 'a.b.c', before: '1', after: '2', kind: 'changed' },
      { key: 'a.b.d', before: '2', after: undefined, kind: 'removed' },
      { key: 'a.e', before: '1', after: undefined, kind: 'removed' },
      { key: 'a.f', before: undefined, after: '3', kind: 'added' },
    ]);
  });

  it('treats arrays and type changes as leaves', () => {
    expect(diffObjects({ a: [1, 2], b: { x: 1 } }, { a: [1, 3], b: 5 })).toEqual([
      { key: 'a', before: '[1,2]', after: '[1,3]', kind: 'changed' },
      { key: 'b', before: '{"x":1}', after: '5', kind: 'changed' },
    ]);
  });
});
