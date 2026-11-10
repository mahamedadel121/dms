import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

// Static guard over every .tsx file under src (PLAN_V2 7.5, DESIGN_SPEC 2 and 5).
const SRC = join(__dirname, '..');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? (n === 'node_modules' ? [] : walk(p)) : /\.tsx$/.test(n) && !/\.test\./.test(n) ? [p] : [];
  });
}

const files = walk(SRC).map((p) => ({ path: relative(SRC, p).split(sep).join('/'), lines: readFileSync(p, 'utf8').split(/\r?\n/) }));

function offenders(re: RegExp, skip: (path: string) => boolean = () => false): string[] {
  const out: string[] = [];
  for (const f of files) {
    if (skip(f.path)) continue;
    f.lines.forEach((line, i) => {
      if (re.test(line)) out.push(`${f.path}:${i + 1}: ${line.trim().slice(0, 120)}`);
    });
  }
  return out;
}

describe('style guard', () => {
  it('scans files', () => expect(files.length).toBeGreaterThan(20));

  it('no physical direction classes', () => {
    const re = /(?<![\w-])(ml|mr|pl|pr)-\d|(?<![\w-])(left|right)-\d|text-(left|right)/;
    expect(offenders(re), 'use logical classes (ms/me/ps/pe/start/end)').toEqual([]);
  });

  it('no legacy palette classes', () => {
    const re = /(bg|text|border|ring|divide|from|to)-(slate|brand|emerald|sky|violet|purple|red|amber)-\d/;
    expect(offenders(re), 'use the design tokens').toEqual([]);
  });

  it('no native date inputs', () => {
    expect(offenders(/type="date"/), 'use DateField').toEqual([]);
  });

  it('no hex colours in tsx', () => {
    const allowed = (p: string) => p === 'components/ui/Seal.tsx' || p.endsWith('/BrandMark.tsx') || p === 'BrandMark.tsx' || p.startsWith('components/charts/');
    expect(offenders(/#[0-9a-fA-F]{6}/, allowed), 'use CSS variables / tokens').toEqual([]);
  });
});
