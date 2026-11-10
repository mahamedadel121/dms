/** Pure helpers for the roles x permissions matrix (no React). */

export interface PermissionMeta {
  code: string;
  groupKey: string;
  nameAr: string;
  nameEn: string;
}

export interface MatrixChange {
  roleId: string;
  added: string[];
  removed: string[];
}

export type GroupState = 'all' | 'some' | 'none';

/** Roles whose permission set differs between `original` and `current`, with what was added and removed. */
export function diffMatrix(original: Record<string, string[]>, current: Record<string, string[]>): MatrixChange[] {
  const out: MatrixChange[] = [];
  for (const roleId of Object.keys(current)) {
    const before = new Set(original[roleId] ?? []);
    const after = new Set(current[roleId] ?? []);
    const added = [...after].filter((c) => !before.has(c)).sort();
    const removed = [...before].filter((c) => !after.has(c)).sort();
    if (added.length || removed.length) out.push({ roleId, added, removed });
  }
  return out;
}

export function groupState(codes: string[], set: Set<string>): GroupState {
  if (codes.length === 0) return 'none';
  const n = codes.filter((c) => set.has(c)).length;
  if (n === 0) return 'none';
  return n === codes.length ? 'all' : 'some';
}

/** Returns a new set with every code of the group switched on or off. */
export function toggleGroup(set: Set<string>, codes: string[], on: boolean): Set<string> {
  const next = new Set(set);
  for (const c of codes) {
    if (on) next.add(c);
    else next.delete(c);
  }
  return next;
}

/** Case-insensitive match on the localized name or the code; an empty query keeps everything. */
export function filterPermissions<T extends PermissionMeta>(meta: T[], q: string, locale: 'ar' | 'en'): T[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return meta;
  return meta.filter((p) => (locale === 'ar' ? p.nameAr : p.nameEn).toLowerCase().includes(needle) || p.code.toLowerCase().includes(needle));
}
