// Load timing (A6 / PLAN_V2 B8): measures the heavy read paths on `dms_load` (filled by load-data.ts).
// Usage: pnpm load:timing [--db=dms_load] [--runs=5] [--explain] [--out=docs/plan-v2/LOAD_RESULTS.md]
// A measurement tool: always exits 0. SLOW rows are the input for further index work.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { createPrisma, findRepoRoot, loadEnv, pgUrl, Prisma } from '@dms/db';
import { getRequestDetail, listQueue, listRequests, queueCounters } from '../src/engine';
import { registerExpenseModule } from '../src/expense';
import { loadAuthUser } from '../src/rbac';
import { buildWhere, FROM_SQL, queryReport } from '../src/reports/query';
import { dashboardSummary, listDelayed } from '../src/reports/dashboard';

loadEnv();

const args = new Map<string, string>();
for (const a of process.argv.slice(2)) {
  const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
  if (m) args.set(m[1], m[2] ?? 'true');
}
const DB_NAME = args.get('db') ?? 'dms_load';
const RUNS = Math.max(1, Number(args.get('runs') ?? 5));
const EXPLAIN = args.has('explain');
const OUT = args.get('out');

interface Row {
  id: string;
  name: string;
  budget: number;
  min: number;
  p50: number;
  max: number;
  error?: string;
}

const iso = (d: Date): string => d.toISOString().slice(0, 10);

async function main(): Promise<void> {
  if (!/^[a-z0-9_]+$/i.test(DB_NAME)) throw new Error(`invalid database name: ${DB_NAME}`);
  const u = pgUrl();
  u.pathname = `/${DB_NAME}`;
  const db = createPrisma(u.toString());
  try {
    registerExpenseModule();
    const [supervisor, accountant1, admin] = await Promise.all(
      ['supervisor', 'accountant1', 'admin'].map(async (username) => {
        const row = await db.user.findUnique({ where: { username }, select: { id: true } });
        if (!row) throw new Error(`seed user ${username} missing in ${DB_NAME}`);
        const au = await loadAuthUser(db, row.id);
        if (!au) throw new Error(`cannot load auth user ${username}`);
        return au;
      }),
    );
    const paid = await db.request.findFirst({ where: { status: 'PAID', number: { startsWith: 'LD-' } }, select: { id: true } });
    if (!paid) throw new Error('no PAID load request found - run pnpm load:data first');

    const day = 86_400_000;
    const to = new Date();
    const from30 = iso(new Date(to.getTime() - 30 * day));
    const from90 = iso(new Date(to.getTime() - 90 * day));
    const toIso = iso(to);
    const wide = { dateField: 'submittedAt' as const };

    const cases: { id: string; name: string; budget: number; run: () => Promise<unknown> }[] = [
      { id: 'Q1', name: 'listQueue active p1', budget: 150, run: () => listQueue(db, supervisor, { tab: 'active', page: 1, pageSize: 25 }) },
      { id: 'Q2', name: 'queueCounters', budget: 150, run: () => queueCounters(db, supervisor) },
      { id: 'Q3', name: 'listQueue active p20', budget: 250, run: () => listQueue(db, supervisor, { tab: 'active', page: 20, pageSize: 25 }) },
      { id: 'Q4', name: 'listRequests admin p1', budget: 200, run: () => listRequests(db, admin, { page: 1, pageSize: 25 }) },
      { id: 'Q5', name: "listRequests number '00042'", budget: 300, run: () => listRequests(db, admin, { number: '00042' }) },
      { id: 'Q6', name: 'listRequests accountant IN_REVIEW', budget: 400, run: () => listRequests(db, accountant1, { status: 'IN_REVIEW', page: 1 }) },
      { id: 'Q7', name: 'getRequestDetail (PAID)', budget: 150, run: () => getRequestDetail(db, paid.id, admin) },
      { id: 'Q8', name: 'queryReport 30d, 50 rows', budget: 800, run: () => queryReport(db, { ...wide, from: from30, to: toIso }, { page: 1, pageSize: 50 }) },
      { id: 'Q9', name: 'queryReport all, by expenseType', budget: 2000, run: () => queryReport(db, wide, { groupBy: 'expenseType', page: 1, pageSize: 50 }) },
      { id: 'Q10', name: 'dashboardSummary 90d', budget: 2000, run: () => dashboardSummary(db, { from: from90, to: toIso }) },
      { id: 'Q11', name: 'listDelayed', budget: 400, run: () => listDelayed(db) },
    ];

    const rows: Row[] = [];
    for (const c of cases) {
      const times: number[] = [];
      let error: string | undefined;
      try {
        await c.run(); // warm-up
        for (let i = 0; i < RUNS; i++) {
          const t = performance.now();
          await c.run();
          times.push(performance.now() - t);
        }
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }
      times.sort((a, b) => a - b);
      const r: Row = {
        id: c.id,
        name: c.name,
        budget: c.budget,
        min: times[0] ?? NaN,
        p50: times.length ? times[Math.floor((times.length - 1) / 2)] : NaN,
        max: times[times.length - 1] ?? NaN,
        ...(error ? { error } : {}),
      };
      rows.push(r);
      console.log(`${c.id.padEnd(4)} ${r.error ? 'ERROR ' + r.error : r.p50.toFixed(0) + ' ms'}`);
    }

    const size = await db.$queryRawUnsafe<{ s: string }[]>(`SELECT pg_size_pretty(pg_database_size(current_database())) AS s`);
    const counts: [string, number][] = [];
    for (const t of ['requests', 'request_lines', 'attachments', 'request_step_instances', 'request_events', 'sap_postings']) {
      const r = await db.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM "${t}"`);
      counts.push([t, Number(r[0].n)]);
    }

    const verdict = (r: Row): string => (r.error ? 'ERROR' : r.p50 <= r.budget ? 'PASS' : 'SLOW');
    const f = (n: number): string => (Number.isNaN(n) ? '-' : n.toFixed(0));
    const lines: string[] = [
      `# Load results (${DB_NAME})`,
      '',
      `Runs per query: ${RUNS} (after one warm-up). Database size: ${size[0]?.s ?? '?'}.`,
      '',
      `Rows: ${counts.map(([t, n]) => `${t} ${n}`).join(', ')}.`,
      '',
      '| Id | Query | Budget p50 (ms) | min | p50 | max | Result |',
      '|---|---|---|---|---|---|---|',
      ...rows.map((r) => `| ${r.id} | ${r.name} | ${r.budget} | ${f(r.min)} | ${f(r.p50)} | ${f(r.max)} | ${verdict(r)}${r.error ? ': ' + r.error.split('\n').pop() : ''} |`),
      '',
    ];

    if (EXPLAIN) {
      const where = buildWhere({ ...wide, from: from30, to: toIso });
      const plans: [string, Prisma.Sql][] = [
        ['Q8 rows (30 days)', Prisma.sql`EXPLAIN (ANALYZE, BUFFERS) SELECT r.id ${FROM_SQL} ${where} ORDER BY r."submittedAt" DESC LIMIT 50`],
        ['Q10 totals (all)', Prisma.sql`EXPLAIN (ANALYZE, BUFFERS) SELECT count(DISTINCT r.id), sum(l.amount) ${FROM_SQL} ${buildWhere(wide)}`],
      ];
      for (const [label, q] of plans) {
        try {
          const out = await db.$queryRaw<Record<string, string>[]>(q);
          const text = out.map((o) => o['QUERY PLAN']).join('\n');
          console.log(`\n--- EXPLAIN ${label} ---\n${text}`);
          lines.push(`## EXPLAIN ${label}`, '', '```', text, '```', '');
        } catch (e) {
          console.log(`EXPLAIN ${label} failed: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }

    console.log(`\nDatabase ${DB_NAME}: ${size[0]?.s ?? '?'}; ${counts.map(([t, n]) => `${t}=${n}`).join(' ')}`);
    console.log('\nId   Query                                  Budget   min    p50    max  Result');
    for (const r of rows) {
      console.log(`${r.id.padEnd(4)} ${r.name.padEnd(38)} ${String(r.budget).padStart(6)} ${f(r.min).padStart(6)} ${f(r.p50).padStart(6)} ${f(r.max).padStart(6)}  ${verdict(r)}`);
    }

    if (OUT) {
      const path = isAbsolute(OUT) ? OUT : join(findRepoRoot(), OUT);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, lines.join('\n'), 'utf8');
      console.log(`\nwrote ${path}`);
    }
  } finally {
    await db.$disconnect();
  }
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(0);
  },
);
