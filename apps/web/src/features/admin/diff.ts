/** One-level-deep diff of two audit payloads. Values are JSON-stringified. */

export interface DiffEntry {
  key: string;
  before: unknown;
  after: unknown;
  kind: 'added' | 'removed' | 'changed';
}

function asRecord(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

const str = (v: unknown) => JSON.stringify(v);

export function diffObjects(before: unknown, after: unknown): DiffEntry[] {
  const a = asRecord(before);
  const b = asRecord(after);
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  const out: DiffEntry[] = [];
  for (const key of keys) {
    const inA = key in a;
    const inB = key in b;
    if (!inA) out.push({ key, before: undefined, after: str(b[key]), kind: 'added' });
    else if (!inB) out.push({ key, before: str(a[key]), after: undefined, kind: 'removed' });
    else if (str(a[key]) !== str(b[key])) out.push({ key, before: str(a[key]), after: str(b[key]), kind: 'changed' });
  }
  return out;
}
