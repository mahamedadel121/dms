// `pnpm demo`: one command to a working demo. db:up -> migrate -> seed (base + demo) -> api + worker + web + driver simulator.
// Ctrl+C stops everything this script started (Postgres is left running). Logs: .demo-logs/*.log
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(__dirname, '..');
const logs = join(root, '.demo-logs');
mkdirSync(logs, { recursive: true });
const rebuild = process.argv.includes('--rebuild');
const noSeed = process.argv.includes('--no-seed');

function step(title: string, cmd: string): void {
  console.log(`\n==> ${title}`);
  const r = spawnSync(cmd, { cwd: root, stdio: 'inherit', shell: true });
  if (r.status !== 0) {
    console.error(`\nFAILED: ${cmd}`);
    process.exit(r.status ?? 1);
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

async function main(): Promise<void> {
  if (!existsSync(join(root, 'node_modules'))) step('Installing dependencies', 'pnpm install');
  // A fresh `pnpm install` leaves @prisma/client un-generated; nothing else is running yet, so no EPERM risk.
  step('Generating Prisma client', 'pnpm db:generate');
  step('Starting PostgreSQL (private cluster on :54329)', 'pnpm db:up');
  step('Applying migrations', 'pnpm db:migrate');
  if (!noSeed) step('Seeding base data + demo requests', 'pnpm db:seed');
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

  console.log('\n==> Starting api, worker, web and driver simulator');
  start('api', 'pnpm --filter @dms/api start');
  start('worker', 'pnpm --filter @dms/worker start');
  start('sim', 'pnpm --filter @dms/bot sim');
  await waitFor('http://localhost:4000/api/v1/health', 'api');
  start('web', 'pnpm --filter @dms/web start');
  await waitFor('http://localhost:3000/login', 'web');
  await waitFor('http://127.0.0.1:3010/', 'sim');

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
  await new Promise(() => undefined);
}

main().catch((e) => {
  console.error(e);
  stopAll();
  process.exit(1);
});
