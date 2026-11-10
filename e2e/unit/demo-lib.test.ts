import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { onGenerateFailure, prismaClientState, sameSchema, shouldGenerate } from '../../scripts/demo-lib';

describe('demo-lib', () => {
  it('sameSchema ignores line endings', () => {
    expect(sameSchema('model A {\r\n  id Int\r\n}\r\n', 'model A {\n  id Int\n}\n')).toBe(true);
    expect(sameSchema('model A {\n  id Int\n}', 'model A {\n  id Int  \n}\n\n')).toBe(true);
    expect(sameSchema('model A {\n  id Int\n}', 'model B {\n  id Int\n}')).toBe(false);
  });

  it('shouldGenerate: fresh without force is false; stale and missing are true; fresh with force is true', () => {
    expect(shouldGenerate('fresh', false)).toBe(false);
    expect(shouldGenerate('stale', false)).toBe(true);
    expect(shouldGenerate('missing', false)).toBe(true);
    expect(shouldGenerate('fresh', true)).toBe(true);
  });

  it('onGenerateFailure: missing aborts; stale and fresh continue with a warning', () => {
    expect(onGenerateFailure('missing')).toBe('abort');
    expect(onGenerateFailure('stale')).toBe('continue-with-warning');
    expect(onGenerateFailure('fresh')).toBe('continue-with-warning');
  });

  it('prismaClientState is missing for an empty folder', () => {
    const empty = mkdtempSync(join(tmpdir(), 'dms-demo-lib-'));
    expect(prismaClientState(empty)).toBe('missing');
  });
});
