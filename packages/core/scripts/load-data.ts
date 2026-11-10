// Load-test data generator (A6 / PLAN_V2 B8). Works ONLY on the database `dms_load` (clone of `dms_template`).
// Usage: pnpm load:data [--requests=50000] [--attachments=200000] [--seed=42] [--fresh] [--db=dms_load]
// Every row goes through typed `createMany`; no raw inserts; no files are written.
import { adminUrl, createPrisma, loadEnv, pgUrl, type Prisma, type PrismaClient } from '@dms/db';

loadEnv();

const args = new Map<string, string>();
for (const a of process.argv.slice(2)) {
  const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
  if (m) args.set(m[1], m[2] ?? 'true');
}
const N_REQ = Number(args.get('requests') ?? 50000);
const N_ATT = Number(args.get('attachments') ?? 200000);
const SEED = Number(args.get('seed') ?? 42);
const DB_NAME = args.get('db') ?? 'dms_load';
const FRESH = args.has('fresh');
const CHUNK = 2000;
const DAY = 86_400_000;

function guardName(name: string): void {
  if (!/^[a-z0-9_]+$/i.test(name)) throw new Error(`invalid database name: ${name}`);
  if (name === 'dms' || name === 'dms_template' || name.startsWith('dms_t_')) {
    throw new Error(`refusing to run on protected database "${name}" (use dms_load)`);
  }
}

function urlFor(name: string): string {
  const u = pgUrl();
  u.pathname = `/${name}`;
  return u.toString();
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(SEED);
const int = (lo: number, hi: number): number => lo + Math.floor(rand() * (hi - lo + 1));
const pick = <T>(a: readonly T[]): T => a[Math.floor(rand() * a.length)];
function weighted<T>(items: readonly (readonly [T, number])[]): T {
  let r = rand() * items.reduce((s, [, w]) => s + w, 0);
  for (const [v, w] of items) {
    r -= w;
    if (r < 0) return v;
  }
  return items[items.length - 1][0];
}
let idCounter = 0;
const nextId = (): string => 'ld' + (++idCounter).toString(36).padStart(22, '0');
const hex64 = (): string => {
  let s = '';
  for (let i = 0; i < 8; i++) s += Math.floor(rand() * 4294967296).toString(16).padStart(8, '0');
  return s;
};
const money = (): string => (int(2000, 500000) / 100).toFixed(2);

type Status = 'PAID' | 'IN_REVIEW' | 'CORRECTION_REQUESTED' | 'REJECTED' | 'APPROVED';
const STATUS_MIX: readonly (readonly [Status, number])[] = [
  ['PAID', 70],
  ['IN_REVIEW', 15],
  ['CORRECTION_REQUESTED', 5],
  ['REJECTED', 8],
  ['APPROVED', 2],
];

async function dbExists(): Promise<boolean> {
  const admin = createPrisma(adminUrl());
  try {
    const r = await admin.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM pg_database WHERE datname='${DB_NAME}'`);
    return (r[0]?.n ?? 0) > 0;
  } finally {
    await admin.$disconnect();
  }
}

async function recreateDb(): Promise<void> {
  const admin = createPrisma(adminUrl());
  try {
    const tpl = await admin.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM pg_database WHERE datname='dms_template'`);
    if (!tpl[0]?.n) throw new Error('dms_template is missing - run pnpm db:migrate first');
    await admin.$executeRawUnsafe(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname IN ('${DB_NAME}','dms_template') AND pid <> pg_backend_pid()`,
    );
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${DB_NAME}"`);
    await admin.$executeRawUnsafe(`CREATE DATABASE "${DB_NAME}" TEMPLATE "dms_template"`);
    console.log(`created ${DB_NAME} from dms_template`);
  } finally {
    await admin.$disconnect();
  }
}

async function main(): Promise<void> {
  const t0 = Date.now();
  guardName(DB_NAME);
  if (FRESH || !(await dbExists())) await recreateDb();
  const db: PrismaClient = createPrisma(urlFor(DB_NAME));
  try {
    const existing = await db.request.count({ where: { number: { startsWith: 'LD-' } } });
    if (existing > 0) console.log(`note: ${DB_NAME} already holds ${existing} load requests (use --fresh to regenerate)`);

    // ---- reference data ----
    const type = await db.requestType.findUnique({
      where: { code: 'DRIVER_EXPENSE' },
      include: {
        lineCategories: {
          where: { isActive: true },
          include: { expenseConfig: { include: { glAccount: true } } },
          orderBy: { sortOrder: 'asc' },
        },
        workflow: {
          include: {
            versions: { where: { status: 'ACTIVE' }, include: { steps: { orderBy: { sortOrder: 'asc' }, include: { role: true } } } },
          },
        },
      },
    });
    if (!type) throw new Error('request type DRIVER_EXPENSE missing in template - run pnpm db:migrate first');
    const wfv = type.workflow?.versions[0];
    if (!wfv) throw new Error('no ACTIVE workflow version');
    const steps = wfv.steps.filter((s) => s.roleId && s.role);
    if (steps.length === 0) throw new Error('workflow has no role steps');
    const cats = type.lineCategories.filter((c) => c.expenseConfig);
    if (cats.length === 0) throw new Error('no line categories with expense (GL) config');
    const treasury = (await db.treasury.findFirst({ where: { isDefault: true } })) ?? (await db.treasury.findFirst());
    const costCenters = await db.costCenter.findMany({ where: { isActive: true } });
    const vehicleTypes = await db.vehicleType.findMany({ where: { isActive: true } });
    if (costCenters.length === 0 || vehicleTypes.length === 0) throw new Error('cost centers / vehicle types missing');
    const dept = await db.department.findFirst({ where: { code: 'VEH' } });

    // stage index per step (steps sharing a parallelGroup share an index)
    const stageOf: number[] = [];
    let stage = -1;
    let lastGroup: string | null = null;
    steps.forEach((s, i) => {
      if (!(s.parallelGroup && s.parallelGroup === lastGroup)) stage++;
      lastGroup = s.parallelGroup;
      stageOf[i] = stage;
    });

    // ---- extra submitters and vehicles ----
    const ldSubmitters = await db.submitter.count({ where: { code: { startsWith: 'LD' } } });
    if (ldSubmitters === 0) {
      await db.submitter.createMany({
        data: Array.from({ length: 200 }, (_, i) => ({
          id: nextId(),
          code: `LD${String(i + 1).padStart(4, '0')}`,
          fullName: `Load Driver ${i + 1}`,
          phone: `+2010900${String(i + 1).padStart(5, '0')}`,
          departmentId: dept?.id ?? null,
        })),
      });
      await db.vehicle.createMany({
        data: Array.from({ length: 150 }, (_, i) => ({
          id: nextId(),
          number: `LD-${1001 + i}`,
          plateNumber: `LD ${1001 + i}`,
          vehicleTypeId: vehicleTypes[i % vehicleTypes.length].id,
          costCenterId: costCenters[i % costCenters.length].id,
        })),
      });
    }
    const submitters = await db.submitter.findMany({ select: { id: true }, where: { isActive: true } });
    const vehicles = await db.vehicle.findMany({
      where: { isActive: true },
      select: {
        id: true,
        number: true,
        plateNumber: true,
        vehicleTypeId: true,
        costCenterId: true,
        vehicleType: { select: { nameEn: true } },
        costCenter: { select: { code: true } },
      },
    });

    // ---- requests in chunks ----
    const now = Date.now();
    let attTotal = 0;
    let reqTotal = 0;
    for (let start = 0; start < N_REQ; start += CHUNK) {
      const n = Math.min(CHUNK, N_REQ - start);
      const lastChunk = start + n >= N_REQ;
      const requests: Prisma.RequestCreateManyInput[] = [];
      const expenses: Prisma.ExpenseRequestCreateManyInput[] = [];
      const lines: Prisma.RequestLineCreateManyInput[] = [];
      const expLines: Prisma.ExpenseLineCreateManyInput[] = [];
      const atts: Prisma.AttachmentCreateManyInput[] = [];
      const insts: Prisma.RequestStepInstanceCreateManyInput[] = [];
      const events: Prisma.RequestEventCreateManyInput[] = [];
      const saps: Prisma.SapPostingCreateManyInput[] = [];

      for (let k = 0; k < n; k++) {
        const seq = start + k + 1;
        const id = nextId();
        const status = weighted(STATUS_MIX);
        const submittedAt = new Date(now - rand() * 540 * DAY);
        const submitterId = pick(submitters).id;
        const veh = pick(vehicles);
        const lineCount = weighted([[1, 30], [2, 35], [3, 25], [4, 10]] as const);
        let total = 0;
        for (let li = 0; li < lineCount; li++) {
          const lineId = nextId();
          const cat = pick(cats);
          const amount = money();
          total += Number(amount);
          lines.push({
            id: lineId,
            requestId: id,
            lineNo: li + 1,
            categoryId: cat.id,
            originalCategoryId: cat.id,
            categoryNameAr: cat.nameAr,
            categoryNameEn: cat.nameEn,
            originalAmount: amount,
            amount,
            lineDate: submittedAt,
          });
          const gl = cat.expenseConfig!.glAccount;
          expLines.push({
            lineId,
            requestId: id,
            glAccountId: gl.id,
            glNumber: gl.number,
            glName: gl.nameEn,
            costCenterId: veh.costCenterId,
            costCenterCode: veh.costCenter.code,
            vehicleId: veh.id,
            vehicleNumber: veh.number,
          });
          const na = weighted([[1, 50], [2, 35], [3, 15]] as const);
          for (let ai = 0; ai < na; ai++) {
            const aid = nextId();
            atts.push({
              id: aid,
              requestId: id,
              lineId,
              storageKey: `attachments/load/${aid}.jpg`,
              mimeType: 'image/jpeg',
              sizeBytes: int(80000, 400000),
              sha256: hex64(),
              phash: null,
              uploadedBySubmitterId: submitterId,
              createdAt: submittedAt,
            });
          }
        }

        // step instances
        const nSteps = steps.length;
        let current = nSteps; // index of the open step; nSteps = all done
        if (status === 'IN_REVIEW' || status === 'CORRECTION_REQUESTED' || status === 'REJECTED') current = int(0, nSteps - 1);
        if (status === 'APPROVED') current = nSteps - 1; // payment (last) step still pending
        const activatedAt = new Date(now - rand() * 10 * DAY);
        const spanMs = Math.min(now - submittedAt.getTime(), int(1, 14) * DAY);
        let lastActed = submittedAt.getTime();
        steps.forEach((s, i) => {
          let st: Prisma.RequestStepInstanceCreateManyInput['status'] = 'PENDING';
          if (i < current) st = 'APPROVED';
          else if (i === current && status === 'IN_REVIEW') st = 'ACTIVE';
          else if (i === current && status === 'CORRECTION_REQUESTED') st = 'AWAITING_CORRECTION';
          else if (i === current && status === 'REJECTED') st = 'REJECTED';
          let acted: Date | null = null;
          if (st === 'APPROVED' || st === 'REJECTED') {
            lastActed += Math.max(60_000, spanMs / (nSteps + 1));
            acted = new Date(Math.min(lastActed, now));
          }
          const open = st === 'ACTIVE' || st === 'AWAITING_CORRECTION';
          insts.push({
            id: nextId(),
            requestId: id,
            workflowStepId: s.id,
            stepKey: s.key,
            stageIndex: stageOf[i],
            sortOrder: s.sortOrder,
            parallelGroup: s.parallelGroup,
            kind: s.kind,
            nameAr: s.nameAr,
            nameEn: s.nameEn,
            roleId: s.roleId as string,
            roleNameAr: s.role!.nameAr,
            roleNameEn: s.role!.nameEn,
            status: st,
            activatedAt: st === 'PENDING' ? null : open ? activatedAt : (acted ?? submittedAt),
            dueAt: st === 'ACTIVE' && s.slaHours ? new Date(activatedAt.getTime() + s.slaHours * 3_600_000) : null,
            actedAt: acted,
          });
        });
        const finishedAt = status === 'PAID' || status === 'REJECTED' ? new Date(Math.min(lastActed, now)) : null;

        events.push({ id: nextId(), requestId: id, type: 'SUBMITTED', actorType: 'SUBMITTER', actorSubmitterId: submitterId, createdAt: submittedAt });
        if (current > 0) events.push({ id: nextId(), requestId: id, type: 'STEP_APPROVED', actorType: 'SYSTEM', createdAt: new Date(Math.min(lastActed, now)) });
        if (status === 'PAID' && finishedAt) events.push({ id: nextId(), requestId: id, type: 'PAID', actorType: 'SYSTEM', createdAt: finishedAt });
        if (status === 'REJECTED' && finishedAt) events.push({ id: nextId(), requestId: id, type: 'REJECTED', actorType: 'SYSTEM', createdAt: finishedAt });

        const yy = String(submittedAt.getUTCFullYear()).slice(2);
        const totalStr = total.toFixed(2);
        requests.push({
          id,
          number: `LD-${yy}-${String(seq).padStart(6, '0')}`,
          requestTypeId: type.id,
          departmentId: type.departmentId,
          workflowVersionId: wfv.id,
          status,
          channel: 'TELEGRAM',
          submitterId,
          clientKey: `load:${seq}`,
          totalOriginal: totalStr,
          totalFinal: totalStr,
          lineCount,
          currentStageIndex: current < nSteps ? stageOf[current] : null,
          submittedAt,
          completedAt: finishedAt,
          paidAt: status === 'PAID' ? finishedAt : null,
          rejectedAt: status === 'REJECTED' ? finishedAt : null,
          rejectionReason: status === 'REJECTED' ? 'Load-test rejection' : null,
          rowVersion: 1,
          createdAt: submittedAt,
        });
        expenses.push({
          requestId: id,
          vehicleId: veh.id,
          vehicleNumber: veh.number,
          plateNumber: veh.plateNumber,
          vehicleTypeId: veh.vehicleTypeId,
          vehicleTypeName: veh.vehicleType.nameEn,
          costCenterId: veh.costCenterId,
          costCenterCode: veh.costCenter.code,
          odometer: int(10000, 900000),
          treasuryId: status === 'PAID' ? (treasury?.id ?? null) : null,
          sapDocNumber: status === 'PAID' ? String(1900000000 + seq) : null,
          sapFiscalYear: status === 'PAID' ? String(submittedAt.getUTCFullYear()) : null,
          sapPostedAt: status === 'PAID' ? finishedAt : null,
        });
        if (status === 'PAID') {
          saps.push({
            id: nextId(),
            requestId: id,
            idempotencyKey: id,
            status: 'POSTED',
            adapter: 'mock',
            payload: { load: true, total: totalStr },
            attempts: 1,
            sapDocNumber: String(1900000000 + seq),
            sapFiscalYear: String(submittedAt.getUTCFullYear()),
            sapCompanyCode: treasury?.companyCode ?? '1000',
            postedAt: finishedAt,
            createdAt: finishedAt ?? submittedAt,
          });
        }
      }

      // top up attachments on the last chunk until the minimum total is reached
      if (lastChunk) {
        const missing = N_ATT - (attTotal + atts.length);
        for (let i = 0; i < missing; i++) {
          const ln = pick(lines);
          const aid = nextId();
          atts.push({
            id: aid,
            requestId: ln.requestId,
            lineId: ln.id,
            storageKey: `attachments/load/${aid}.jpg`,
            mimeType: 'image/jpeg',
            sizeBytes: int(80000, 400000),
            sha256: hex64(),
            phash: null,
          });
        }
      }

      await db.request.createMany({ data: requests });
      await db.expenseRequest.createMany({ data: expenses });
      await db.requestLine.createMany({ data: lines });
      await db.expenseLine.createMany({ data: expLines });
      await db.attachment.createMany({ data: atts });
      await db.requestStepInstance.createMany({ data: insts });
      await db.requestEvent.createMany({ data: events });
      if (saps.length > 0) await db.sapPosting.createMany({ data: saps });
      reqTotal += requests.length;
      attTotal += atts.length;
      console.log(`  ${reqTotal}/${N_REQ} requests, ${attTotal} attachments (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
    }

    await db.$executeRawUnsafe('ANALYZE');

    const tables = [
      'submitters',
      'vehicles',
      'requests',
      'expense_requests',
      'request_lines',
      'expense_lines',
      'attachments',
      'request_step_instances',
      'request_events',
      'sap_postings',
    ];
    console.log('\nTable                      Rows');
    let totalRequests = 0;
    let totalAtts = 0;
    for (const t of tables) {
      const r = await db.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM "${t}"`);
      const c = Number(r[0].n);
      if (t === 'requests') totalRequests = c;
      if (t === 'attachments') totalAtts = c;
      console.log(`${t.padEnd(26)} ${c}`);
    }
    console.log(`\nelapsed ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    if (totalRequests < N_REQ || totalAtts < N_ATT) {
      console.error(`FAILED: requests ${totalRequests}/${N_REQ}, attachments ${totalAtts}/${N_ATT}`);
      process.exitCode = 1;
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
