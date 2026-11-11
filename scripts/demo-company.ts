// `pnpm demo:company`: a small, clean company demo, fully separated from the main working data.
// Own database (dms_demo), own file storage (./storage-demo), own web build (.next-demo).
// Every server runs in its OWN hidden console (a shared console kills servers on Ctrl+C, exit 0xC000013A), so this
// script exits when everything is up and the servers keep running. Logs: .demo-logs/<name>.log
// Flags:
//   --reset     drop + recreate dms_demo, delete ./storage-demo, reseed (stop first if running)
//   --rebuild   rebuild the web app into .next-demo
//   --generate  force `pnpm db:generate` even when the Prisma client looks up to date
//   --stop      stop the demo servers and exit
// Env: DEMO_COMPANY_NAME (default "MSR").
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import dotenv from 'dotenv';
import { onGenerateFailure, prismaClientState, shouldGenerate } from './demo-lib';

const root = resolve(__dirname, '..');
const logs = join(root, '.demo-logs');
const pidFile = join(logs, 'company-pids.json');
mkdirSync(logs, { recursive: true });

const args = new Set(process.argv.slice(2));
const COMPANY = process.env.DEMO_COMPANY_NAME || 'MSR';
const DEMO_DB = 'dms_demo';
const DEMO_URL = `postgresql://postgres@localhost:54329/${DEMO_DB}`;

// .env first (it never overrides what is already set), then the demo values win for this process and every child.
dotenv.config({ path: join(root, '.env'), quiet: true } as dotenv.DotenvConfigOptions);
Object.assign(process.env, {
  DATABASE_URL: DEMO_URL,
  STORAGE_ROOT: './storage-demo',
  NEXT_PUBLIC_DEMO_MODE: '1',
  NEXT_DIST_DIR: '.next-demo',
  NEXT_PUBLIC_COMPANY_NAME: COMPANY,
  DEMO_COMPANY_NAME: COMPANY,
});
delete process.env.BOT_SIMULATOR;

const API_HEALTH = 'http://localhost:4000/api/v1/health';
const WEB_LOGIN = 'http://localhost:3000/login';
const SIM_HOME = 'http://127.0.0.1:3010/';
const PORTS = [3000, 4000, 3010];

const q = (s: string): string => `'${s.replace(/'/g, "''")}'`;

function step(title: string, cmd: string): void {
  console.log(`\n==> ${title}`);
  const r = spawnSync(cmd, { cwd: root, stdio: 'inherit', shell: true, env: process.env });
  if (r.status !== 0) {
    console.error(`\nFAILED: ${cmd}`);
    process.exit(r.status ?? 1);
  }
}

function ps(command: string): string {
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { encoding: 'utf8', windowsHide: true });
  return r.stdout ?? '';
}

/** Node processes listening on the demo ports that belong to this repo (api/web/sim). */
function repoPidsOnPorts(): number[] {
  const script = `
$root = ${q(root)}
$ports = ${PORTS.join(',')}
foreach ($port in $ports) {
  Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
    $p = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $_.OwningProcess)
    if ($p -and $p.Name -eq 'node.exe') {
      $cl = [string]$p.CommandLine
      if ($cl.IndexOf($root, [StringComparison]::OrdinalIgnoreCase) -ge 0 -or $cl -match 'swc-node|src[\\\\/]main\\.ts|simulator|sim\\.ts') { $p.ProcessId }
    }
  }
}`;
  return ps(script)
    .split(/\r?\n/)
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
}

function killTree(pid: number): void {
  spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
}

function stopServers(): void {
  let pids: number[] = [];
  if (existsSync(pidFile)) {
    try {
      pids = Object.values(JSON.parse(readFileSync(pidFile, 'utf8')) as Record<string, number>);
    } catch {
      /* ignore a broken pid file */
    }
    rmSync(pidFile, { force: true });
  }
  for (const pid of new Set([...pids, ...repoPidsOnPorts()])) killTree(pid);
}

async function isUp(url: string): Promise<boolean> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(1500) });
    return r.status < 500;
  } catch {
    return false;
  }
}

async function waitFor(url: string, name: string, ms = 180_000): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await isUp(url)) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`${name} did not come up at ${url} (see .demo-logs/${name}.log)`);
}

const pids: Record<string, number> = {};
/** Starts `cmd` in its own hidden console (inherits this process's environment) with output redirected to a log. */
function startHidden(name: string, cmd: string): void {
  const log = join(logs, `${name}.log`);
  const inner = `${cmd} > "${log}" 2>&1`;
  const out = ps(
    `$p = Start-Process -FilePath cmd.exe -ArgumentList '/c', ${q(inner)} -WorkingDirectory ${q(root)} -WindowStyle Hidden -PassThru; $p.Id`,
  );
  const pid = Number(out.trim().split(/\r?\n/).pop());
  if (Number.isInteger(pid) && pid > 0) pids[name] = pid;
  writeFileSync(pidFile, JSON.stringify(pids));
  console.log(`[${name}] started (log: .demo-logs/${name}.log)`);
}

// ---- database helpers (pg is resolved from packages/db)
type PgClient = { connect(): Promise<void>; query(sql: string, p?: unknown[]): Promise<{ rowCount: number | null; rows: Record<string, unknown>[] }>; end(): Promise<void> };
function newClient(db: string): PgClient {
  const pg = createRequire(join(root, 'packages', 'db', 'package.json'))('pg') as { Client: new (o: { connectionString: string }) => PgClient };
  return new pg.Client({ connectionString: `postgresql://postgres@localhost:54329/${db}` });
}

async function ensureDatabase(reset: boolean): Promise<void> {
  const admin = newClient('postgres');
  await admin.connect();
  try {
    if (reset) {
      await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid <> pg_backend_pid()', [DEMO_DB]);
      await admin.query(`DROP DATABASE IF EXISTS "${DEMO_DB}"`);
    }
    const r = await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [DEMO_DB]);
    if (r.rowCount === 0) await admin.query(`CREATE DATABASE "${DEMO_DB}"`);
  } finally {
    await admin.end();
  }
}

async function userCount(): Promise<number> {
  const c = newClient(DEMO_DB);
  await c.connect();
  try {
    const r = await c.query('SELECT count(*)::int AS n FROM users');
    return Number(r.rows[0]?.n ?? 0);
  } catch {
    return 0;
  } finally {
    await c.end();
  }
}

function printBanner(): void {
  const bot = process.env.BOT_TOKEN ? (process.env.BOT_USERNAME ? `https://t.me/${process.env.BOT_USERNAME}` : '(running)') : '(BOT_TOKEN not set - not started)';
  console.log(`
==============================================================
 DMS company demo is running  -  ${COMPANY}
   Web app          http://localhost:3000        (Arabic, RTL)
   Driver simulator http://127.0.0.1:3010        (backup if there is no internet)
   API health       ${API_HEALTH}
   Telegram bot     ${bot}
 Logins (password for all: Passw0rd!)
   supervisor  engineer  shipping  manager  accountant1  chief  gm  treasury  admin
 Drivers: DRV001 (vehicle 2157), DRV002, DRV003 ...
 Own data: database ${DEMO_DB}, files ./storage-demo, build apps/web/${process.env.NEXT_DIST_DIR}
 Stop:  pnpm demo:company:stop      Wipe + reseed:  pnpm demo:company:reset
 Logs:  .demo-logs/
==============================================================`);
}

async function main(): Promise<void> {
  if (args.has('--stop')) {
    stopServers();
    console.log('demo servers stopped (PostgreSQL stays running)');
    return;
  }
  const reset = args.has('--reset');

  console.log('==> Stopping anything already running on :3000 / :4000 / :3010');
  stopServers();
  await new Promise((r) => setTimeout(r, 1500));

  if (!existsSync(join(root, 'node_modules'))) step('Installing dependencies', 'pnpm install');

  const state = prismaClientState(root);
  if (shouldGenerate(state, args.has('--generate'))) {
    console.log('\n==> Generating Prisma client');
    const r = spawnSync('pnpm db:generate', { cwd: root, stdio: 'inherit', shell: true });
    if (r.status !== 0) {
      if (onGenerateFailure(state) === 'abort') {
        console.error('\nPrisma client is not generated and generation failed. Stop every running node process of this project, then run: pnpm db:generate');
        process.exit(r.status ?? 1);
      }
      console.warn('\nWARNING: could not regenerate the Prisma client (files locked). Continuing with the existing client.');
    }
  } else {
    console.log('\n==> Prisma client is up to date (skipping generate)');
  }

  step('Starting PostgreSQL (private cluster on :54329)', 'pnpm db:up');

  if (reset) {
    console.log(`\n==> RESET: dropping ${DEMO_DB} and deleting ./storage-demo`);
    rmSync(join(root, 'storage-demo'), { recursive: true, force: true });
  }
  await ensureDatabase(reset);
  // Migrates ONLY dms_demo (DATABASE_URL is the demo URL); the main `dms` and `dms_template` are not touched.
  step(`Applying migrations to ${DEMO_DB}`, 'pnpm --filter @dms/db exec prisma migrate deploy --schema prisma/schema.prisma');

  if (reset || (await userCount()) === 0) {
    step('Seeding the company demo data (base data + 3 sample requests with receipts)', 'pnpm --filter @dms/core exec tsx scripts/seed-demo-company.ts');
  } else {
    console.log('\n==> Demo data already present (use --reset to wipe and reseed)');
  }

  const webBuilt = existsSync(join(root, 'apps', 'web', process.env.NEXT_DIST_DIR!, 'BUILD_ID'));
  if (args.has('--rebuild') || !webBuilt) step('Building the web app into .next-demo (first run only, ~1-3 min)', 'pnpm --filter @dms/web build');

  console.log('\n==> Starting api, worker, bot and driver simulator (each in its own hidden console)');
  startHidden('api', 'pnpm --filter @dms/api start');
  startHidden('worker', 'pnpm --filter @dms/worker start');
  if (process.env.BOT_TOKEN) startHidden('bot', 'pnpm --filter @dms/bot start');
  else console.log('[bot] BOT_TOKEN not set - real bot not started');
  startHidden('sim', 'pnpm --filter @dms/bot sim');
  await waitFor(API_HEALTH, 'api');
  startHidden('web', 'pnpm --filter @dms/web start');
  await waitFor(WEB_LOGIN, 'web');
  await waitFor(SIM_HOME, 'sim');

  printBanner();
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
