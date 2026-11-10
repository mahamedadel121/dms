// `pnpm demo`: one command to a working demo. db:up -> migrate -> seed (base + demo) -> api + worker + web + driver simulator.
// Ctrl+C stops everything this script started (Postgres is left running). Logs: .demo-logs/*.log
// Flags:
//   --generate  force `pnpm db:generate` even when the Prisma client is already up to date
//   --rebuild   rebuild the web app (a running web server keeps serving the old build until restarted)
//   --no-seed   skip the seed step
// Servers that are already running (api :4000, web :3000, simulator :3010) are reused, not started again.
// A running API skips db:migrate and db:seed (its connections would block the template rebuild).
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { onGenerateFailure, prismaClientState, shouldGenerate } from './demo-lib';

const root = resolve(__dirname, '..');
const logs = join(root, '.demo-logs');
mkdirSync(logs, { recursive: true });
const rebuild = process.argv.includes('--rebuild');
const noSeed = process.argv.includes('--no-seed');

const API_HEALTH = 'http://localhost:4000/api/v1/health';
const WEB_LOGIN = 'http://localhost:3000/login';
const SIM_HOME = 'http://127.0.0.1:3010/';

function step(title: string, cmd: string): void {
  console.log(`\n==> ${title}`);
  const r = spawnSync(cmd, { cwd: root, stdio: 'inherit', shell: true });
  if (r.status !== 0) {
    console.error(`\nFAILED: ${cmd}`);
    process.exit(r.status ?? 1);
  }
}

async function isUp(url: string): Promise<boolean> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(1500) });
    return r.status < 500;
  } catch {
    return false;
  }
}

async function waitFor(url: string, name: string, ms = 120_000): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const r = await fetch(url);
      if (r.status < 500) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`${name} did not come up at ${url} (see .demo-logs/${name}.log)`);
}

const children: ChildProcess[] = [];
function start(name: string, cmd: string): void {
  const out = createWriteStream(join(logs, `${name}.log`));
  const c = spawn(cmd, { cwd: root, shell: true, env: { ...process.env, BOT_SIMULATOR: name === 'sim' ? '1' : process.env.BOT_SIMULATOR } });
  c.stdout?.pipe(out);
  c.stderr?.pipe(out);
  c.on('exit', (code) => console.log(`[${name}] exited (${code})`));
  children.push(c);
}

function stopAll(): void {
  for (const c of children) {
    if (!c.pid) continue;
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(c.pid), '/T', '/F'], { stdio: 'ignore' });
    else c.kill('SIGTERM');
  }
}

function printBanner(): void {
  console.log(`
==============================================================
 DMS demo is running
   Web app          http://localhost:3000        (Arabic, RTL)
   API              http://localhost:4000/api/v1/health
   Driver simulator http://127.0.0.1:3010        (acts as the Telegram bot)
 Logins (password for all: Passw0rd!)
   admin  supervisor  manager  engineer  shipping
   accountant1  accountant2  chief  gm  treasury
 Drivers in the simulator: DRV001 ... DRV010
 Press Ctrl+C to stop (PostgreSQL stays running). Logs: .demo-logs/
==============================================================`);
}

async function main(): Promise<void> {
  const apiUp = await isUp(API_HEALTH);
  const webUp = await isUp(WEB_LOGIN);
  const simUp = await isUp(SIM_HOME);
  if (apiUp) console.log('[api] already running, reusing it');
  if (webUp) console.log('[web] already running, reusing it');
  if (simUp) console.log('[sim] already running, reusing it');
  if (rebuild && webUp) console.warn('\nWARNING: the web server on :3000 is already running and still serves the old build. Restart it to pick up the rebuild.');

  if (!existsSync(join(root, 'node_modules'))) step('Installing dependencies', 'pnpm install');

  const state = prismaClientState(root);
  if (shouldGenerate(state, process.argv.includes('--generate'))) {
    console.log('\n==> Generating Prisma client');
    const r = spawnSync('pnpm db:generate', { cwd: root, stdio: 'inherit', shell: true });
    if (r.status !== 0) {
      if (onGenerateFailure(state) === 'abort') {
        console.error('\nPrisma client is not generated and generation failed. Stop every running node process of this project, then run: pnpm db:generate');
        process.exit(r.status ?? 1);
      }
      console.warn('\nWARNING: could not regenerate the Prisma client (files are locked by a running process). Continuing with the existing client. If the schema changed, stop all node processes and run: pnpm db:generate');
    }
  } else {
    console.log('\n==> Prisma client is up to date (skipping generate)');
  }

  step('Starting PostgreSQL (private cluster on :54329)', 'pnpm db:up');
  if (apiUp) {
    console.log('\nDatabase steps skipped because the API is already running; stop it to migrate or reseed.');
  } else {
    step('Applying migrations', 'pnpm db:migrate');
    if (!noSeed) step('Seeding base data + demo requests', 'pnpm db:seed');
  }
  if (rebuild || !existsSync(join(root, 'apps', 'web', '.next', 'BUILD_ID'))) step('Building the web app (first run only, ~1-2 min)', 'pnpm --filter @dms/web build');

  process.on('SIGINT', () => {
    console.log('\nStopping demo servers (PostgreSQL stays running)...');
    stopAll();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    stopAll();
    process.exit(0);
  });

  if (apiUp && webUp && simUp) {
    printBanner();
    console.log('\nEverything is already running; nothing was started.');
    process.exit(0);
  }

  console.log('\n==> Starting api, worker, web and driver simulator');
  if (!apiUp) {
    start('api', 'pnpm --filter @dms/api start');
    start('worker', 'pnpm --filter @dms/worker start');
  }
  if (!simUp) start('sim', 'pnpm --filter @dms/bot sim');
  if (!apiUp) await waitFor(API_HEALTH, 'api');
  if (!webUp) {
    start('web', 'pnpm --filter @dms/web start');
    await waitFor(WEB_LOGIN, 'web');
  }
  if (!simUp) await waitFor(SIM_HOME, 'sim');

  printBanner();
  await new Promise(() => undefined);
}

main().catch((e) => {
  console.error(e);
  stopAll();
  process.exit(1);
});
