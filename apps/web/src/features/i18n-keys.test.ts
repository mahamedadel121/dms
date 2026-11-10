import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { dictionaries, NAMESPACES, type Namespace } from '../i18n';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(n) && !/\.test\./.test(n) ? [p] : [];
  });
}

const files = walk(__dirname);
const used = new Set<string>();
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(/\bt\(\s*'([a-z]+\.[A-Za-z0-9_.]+)'/g)) used.add(m[1]!);
}

describe('WP7 i18n coverage', () => {
  it('finds keys', () => expect(used.size).toBeGreaterThan(100));
  for (const locale of ['ar', 'en'] as const) {
    it(`every static t() key exists in ${locale}`, () => {
      const missing = [...used].filter((k) => {
        const i = k.indexOf('.');
        const ns = k.slice(0, i) as Namespace;
        return dictionaries[locale][ns]?.[k.slice(i + 1)] === undefined;
      });
      expect(missing).toEqual([]);
    });
  }
  it('ar and en dictionaries of WP7 namespaces have identical keys', () => {
    for (const ns of ['requests', 'workflows', 'templates', 'reports', 'sap', 'dashboard'] as const) {
      expect(Object.keys(dictionaries.en[ns]).sort()).toEqual(Object.keys(dictionaries.ar[ns]).sort());
    }
  });
  it('every namespace has the same keys in ar and en', () => {
    for (const ns of NAMESPACES) {
      const ar = Object.keys(dictionaries.ar[ns]);
      const en = Object.keys(dictionaries.en[ns]);
      expect({ ns, onlyAr: ar.filter((k) => !(k in dictionaries.en[ns])).sort() }).toEqual({ ns, onlyAr: [] });
      expect({ ns, onlyEn: en.filter((k) => !(k in dictionaries.ar[ns])).sort() }).toEqual({ ns, onlyEn: [] });
    }
  });
  it('new namespaces are registered', () => {
    for (const ns of ['ui', 'shell', 'inbox', 'rt']) {
      expect(NAMESPACES as readonly string[]).toContain(ns);
      expect(Object.keys(dictionaries.ar[ns as Namespace]).length, `ar.${ns} is empty`).toBeGreaterThan(0);
      expect(Object.keys(dictionaries.en[ns as Namespace]).length, `en.${ns} is empty`).toBeGreaterThan(0);
    }
  });
});
