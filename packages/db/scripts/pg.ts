// Local PostgreSQL cluster driver (PLAN §2.2). All children use stdio 'ignore' and are detached
// so Git Bash does not hang on inherited handles.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { adminUrl, pgBin, pgDataDir, pgUrl, PG_PORT } from '../src/pgconfig';

function run(exe: string, args: string[]): number {
  const r = spawnSync(pgBin(exe), args, { stdio: 'ignore', windowsHide: true });
  return r.status ?? 1;
}

function isLocalManaged(): boolean {
  const u = pgUrl();
  return ['localhost', '127.0.0.1'].includes(u.hostname) && Number(u.port || 5432) === PG_PORT;
}

const isReady = () => run('pg_isready', ['-h', 'localhost', '-p', String(PG_PORT)]) === 0;

async function ensureDatabase(name: string): Promise<void> {
  const c = new pg.Client({ connectionString: adminUrl() });
  await c.connect();
  try {
    const r = await c.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (r.rowCount === 0) await c.query(`CREATE DATABASE "${name}"`);
  } finally {
    await c.end();
  }
}

async function up(): Promise<void> {
  if (!isLocalManaged()) {
    console.log('DATABASE_URL is not localhost:54329 - using external server, nothing to start');
    return;
  }
  const data = pgDataDir();
  if (!existsSync(join(data, 'PG_VERSION'))) {
    mkdirSync(data, { recursive: true });
    if (run('initdb', ['-D', data, '-U', 'postgres', '--auth=trust', '-E', 'UTF8']) !== 0) {
      throw new Error('initdb failed');
    }
  }
  if (!isReady()) {
    // pg_ctl may stay alive on Windows (restricted-token wrapper): never wait for it, poll readiness instead.
    const child = spawn(pgBin('pg_ctl'), ['-D', data, '-o', `-p ${PG_PORT}`, '-l', join(data, 'server.log'), 'start'], {
      stdio: 'ignore',
      detached: true,
      windowsHide: true,
    });
    child.unref();
    const deadline = Date.now() + 60_000;
    while (!isReady()) {
      if (Date.now() > deadline) throw new Error('postgres did not become ready; see .pgdata/server.log');
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  await ensureDatabase(pgUrl().pathname.slice(1) || 'dms');
  console.log(`postgres ready on localhost:${PG_PORT}`);
}

function down(): void {
  if (!isLocalManaged()) return;
  run('pg_ctl', ['-D', pgDataDir(), '-m', 'fast', 'stop']);
  console.log('postgres stopped');
}

const cmd = process.argv[2];
if (cmd === 'up') {
  up().then(
    () => process.exit(0),
    (e) => {
      console.error(e);
      process.exit(1);
    },
  );
} else if (cmd === 'down') {
  down();
} else if (cmd === 'status') {
  console.log(isReady() ? 'up' : 'down');
  process.exit(isReady() ? 0 : 1);
} else {
  console.error('usage: pg.ts up|down|status');
  process.exit(2);
}
