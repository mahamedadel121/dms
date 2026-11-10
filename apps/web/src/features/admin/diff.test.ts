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
});
