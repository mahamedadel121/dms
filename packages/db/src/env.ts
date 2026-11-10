import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import dotenv from 'dotenv';

/** Repo root = nearest ancestor containing pnpm-workspace.yaml. */
export function findRepoRoot(start = process.cwd()): string {
  let dir = resolve(start);
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return resolve(start);
    dir = parent;
  }
}

let loaded = false;
/** Loads <repo root>/.env once (does not override variables already set). */
export function loadEnv(): string {
  const root = findRepoRoot();
  if (!loaded) {
    dotenv.config({ path: join(root, '.env'), quiet: true } as dotenv.DotenvConfigOptions);
    loaded = true;
  }
  return root;
}
