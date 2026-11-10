// Launcher: runs packages/core/scripts/load-data.ts through the @dms/core package (PLAN_V2 B8).
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2).map((a) => JSON.stringify(a)).join(' ');
const r = spawnSync(`pnpm --filter @dms/core exec tsx scripts/load-data.ts ${args}`, { stdio: 'inherit', shell: true });
process.exit(r.status ?? 1);
