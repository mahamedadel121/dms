// Pure helpers for `scripts/demo.ts` (Prisma client state and generate decisions). Tested from e2e/unit/demo-lib.test.ts.
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

export type PrismaClientState = 'fresh' | 'stale' | 'missing';

/** Directory of the generated Prisma client (…/.prisma/client) as resolved from packages/db, or null. */
export function prismaClientDir(root: string): string | null {
  try {
    const req = createRequire(join(root, 'packages', 'db', 'package.json'));
    const resolved = req.resolve('@prisma/client/package.json');
    const dir = join(dirname(resolved), '..', '..', '.prisma', 'client');
    return existsSync(join(dir, 'index.js')) ? dir : null;
  } catch {
    return null;
  }
}

/** 'fresh' = generated and its schema.prisma copy equals the repo schema; 'stale' = generated but different; 'missing' = not generated. */
export function prismaClientState(root: string): PrismaClientState {
  const dir = prismaClientDir(root);
  if (dir === null) return 'missing';
  try {
    const repoSchema = readFileSync(join(root, 'packages', 'db', 'prisma', 'schema.prisma'), 'utf8');
    const copy = join(dir, 'schema.prisma');
    if (!existsSync(copy)) return 'stale';
    return sameSchema(readFileSync(copy, 'utf8'), repoSchema) ? 'fresh' : 'stale';
  } catch {
    return 'stale';
  }
}

/** true unless state === 'fresh' && !force */
export function shouldGenerate(state: PrismaClientState, force: boolean): boolean {
  return !(state === 'fresh' && !force);
}

/** What to do when `prisma generate` failed. */
export function onGenerateFailure(state: PrismaClientState): 'abort' | 'continue-with-warning' {
  return state === 'missing' ? 'abort' : 'continue-with-warning';
}

/** Compare schema texts ignoring line endings and trailing whitespace. */
export function sameSchema(a: string, b: string): boolean {
  return normalizeSchema(a) === normalizeSchema(b);
}

function normalizeSchema(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .join('\n')
    .trimEnd();
}
