import { spawn } from 'node:child_process';
import { loadEnv } from '../packages/db/src/env';

loadEnv();
const cmds = [
  ['api', 'pnpm --filter @dms/api dev'],
  ['web', 'pnpm --filter @dms/web dev'],
  ['worker', 'pnpm --filter @dms/worker dev'],
];
if (process.env.BOT_TOKEN) cmds.push(['bot', 'pnpm --filter @dms/bot dev']);
const names = cmds.map((c) => c[0]).join(',');
const args = ['concurrently', '-n', names, ...cmds.map((c) => JSON.stringify(c[1]))];
spawn('pnpm', ['exec', ...args], { stdio: 'inherit', shell: true });
