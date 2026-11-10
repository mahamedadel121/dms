/** Field-level diff of two audit payloads. Values are JSON-stringified. */

export interface DiffEntry {
  key: string;
  before: unknown;
  after: unknown;
  kind: 'added' | 'removed' | 'changed';
}

function isPlain(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

const asRecord = (v: unknown): Record<string, unknown> => (isPlain(v) ? v : {});
const str = (v: unknown) => JSON.stringify(v);

function walk(a: Record<string, unknown>, b: Record<string, unknown>, prefix: string, out: DiffEntry[]): void {
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  for (const k of keys) {
    const key = prefix ? `${prefix}.${k}` : k;
    const inA = k in a;
    const inB = k in b;
    if (inA && inB && isPlain(a[k]) && isPlain(b[k])) walk(a[k] as Record<string, unknown>, b[k] as Record<string, unknown>, key, out);
    else if (!inA) out.push({ key, before: undefined, after: str(b[k]), kind: 'added' });
    else if (!inB) out.push({ key, before: str(a[k]), after: undefined, kind: 'removed' });
    else if (str(a[k]) !== str(b[k])) out.push({ key, before: str(a[k]), after: str(b[k]), kind: 'changed' });
  }
}

/** Nested plain objects are compared recursively and reported with dotted paths (`a.b.c`). Arrays and type changes are leaves. */
export function diffObjects(before: unknown, after: unknown): DiffEntry[] {
  const out: DiffEntry[] = [];
  walk(asRecord(before), asRecord(after), '', out);
  return out;
}
