// db:migrate = prisma migrate deploy on `dms`, then rebuild `dms_template` (drop, create, migrate, base seed).
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { adminUrl, pgUrl } from '../src/pgconfig';
import { loadEnv } from '../src/env';

const root = loadEnv();
const dbDir = join(root, 'packages', 'db');

function withDb(name: string): string {
  const u = pgUrl();
  u.pathname = `/${name}`;
  return u.toString();
}

function sh(args: string[], url: string): void {
  const r = spawnSync('pnpm', args, {
    cwd: dbDir,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, DATABASE_URL: url },
  });
  if (r.status !== 0) throw new Error(`failed: pnpm ${args.join(' ')}`);
}

async function main(): Promise<void> {
  const devName = pgUrl().pathname.slice(1) || 'dms';
  const admin = new pg.Client({ connectionString: adminUrl() });
  await admin.connect();
  try {
    const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [devName]);
    if (exists.rowCount === 0) await admin.query(`CREATE DATABASE "${devName}"`);
  } finally {
    await admin.end();
  }
  sh(['exec', 'prisma', 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'], withDb(devName));

  const tpl = 'dms_template';
  const a2 = new pg.Client({ connectionString: adminUrl() });
  await a2.connect();
  try {
    await a2.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid <> pg_backend_pid()`,
      [tpl],
    );
    await a2.query(`DROP DATABASE IF EXISTS "${tpl}"`);
    await a2.query(`CREATE DATABASE "${tpl}"`);
  } finally {
    await a2.end();
  }
  const tplUrl = withDb(tpl);
  sh(['exec', 'prisma', 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'], tplUrl);
  if (existsSync(join(dbDir, 'prisma', 'seed.ts'))) {
    sh(['exec', 'tsx', 'prisma/seed.ts'], tplUrl);
  } else {
    console.log('prisma/seed.ts not present yet - dms_template has no base seed');
  }
  console.log('migrations applied to', devName, 'and', tpl, 'rebuilt');
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
