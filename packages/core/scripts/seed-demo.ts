// Demo seed (WP8): ~30 sample requests in mixed states, created THROUGH THE REAL ENGINE (submitRequest, approveStep,
// requestCorrection, rejectRequest, editLine) with generated receipt images. Runs after the base seed (`pnpm db:seed`).
// Idempotent: every request has clientKey `demo:<n>`; if any exists the script does nothing.
// Final PDFs are produced by the worker (pdf.finalize jobs stay PENDING until `pnpm dev` / the demo script starts it).
import sharp from 'sharp';
import { createPrisma, loadEnv, type PrismaClient } from '@dms/db';
import { approveStep, editLine, rejectRequest, requestCorrection, submitRequest } from '../src/engine';
import { registerExpenseModule } from '../src/expense';
import { ingestAttachment } from '../src/media';
import { loadAuthUser } from '../src/rbac';
import { getSapAdapter, processSapPosting, type MockSapAdapter } from '../src/sap';
import { getStorage } from '../src/storage';

loadEnv();

type Scenario =
  | 'SUBMITTED'
  | 'SUP' // supervisor approved
  | 'MID' // everything up to (not including) chief accountant
  | 'GM' // waiting for the GM
  | 'TREASURY' // waiting for the treasury
  | 'CORRECTION'
  | 'REJECTED'
  | 'PAID'
  | 'PAID_SAP_FAILED';

const PLAN: { n: number; scenario: Scenario; driver: number; lines: ('MAINTENANCE' | 'TIPS' | 'DIESEL' | 'TOLLS' | 'WEIGHBRIDGE' | 'SPARE_PARTS' | 'FINES' | 'OTHER')[]; edit?: boolean }[] = [
  ...[1, 2, 3, 4, 5, 6].map((d, i) => ({ n: i + 1, scenario: 'SUBMITTED' as const, driver: d, lines: [['TOLLS'], ['DIESEL', 'TOLLS'], ['MAINTENANCE'], ['TIPS', 'WEIGHBRIDGE'], ['DIESEL'], ['OTHER']][i] as never })),
  ...[1, 2, 3, 4].map((d, i) => ({ n: 7 + i, scenario: 'SUP' as const, driver: d, lines: [['TOLLS', 'DIESEL'], ['MAINTENANCE', 'TIPS'], ['WEIGHBRIDGE'], ['SPARE_PARTS']][i] as never })),
  { n: 11, scenario: 'MID', driver: 5, lines: ['DIESEL', 'TOLLS'] },
  { n: 12, scenario: 'MID', driver: 6, lines: ['TIPS'] },
  { n: 13, scenario: 'GM', driver: 9, lines: ['DIESEL'], edit: true },
  { n: 14, scenario: 'TREASURY', driver: 10, lines: ['TOLLS', 'WEIGHBRIDGE'] },
  { n: 15, scenario: 'CORRECTION', driver: 1, lines: ['TOLLS'] },
  { n: 16, scenario: 'CORRECTION', driver: 2, lines: ['DIESEL'] },
  { n: 17, scenario: 'CORRECTION', driver: 3, lines: ['MAINTENANCE'] },
  { n: 18, scenario: 'REJECTED', driver: 4, lines: ['FINES'] },
  { n: 19, scenario: 'REJECTED', driver: 5, lines: ['OTHER'] },
  { n: 20, scenario: 'REJECTED', driver: 6, lines: ['TOLLS'] },
  ...[1, 2, 3, 4, 5, 6, 9, 10, 1, 2].map((d, i) => ({
    n: 21 + i,
    scenario: 'PAID' as const,
    driver: d,
    lines: [['TOLLS', 'DIESEL'], ['MAINTENANCE', 'TIPS', 'DIESEL'], ['DIESEL'], ['WEIGHBRIDGE', 'TOLLS'], ['SPARE_PARTS'], ['DIESEL', 'TOLLS'], ['TOLLS'], ['TIPS'], ['DIESEL', 'WEIGHBRIDGE'], ['MAINTENANCE']][i] as never,
    edit: i % 3 === 0,
  })),
  { n: 31, scenario: 'PAID_SAP_FAILED', driver: 3, lines: ['DIESEL', 'TOLLS'] },
];

const AMOUNTS: Record<string, [number, number]> = {
  TOLLS: [40, 180],
  WEIGHBRIDGE: [25, 90],
  FINES: [200, 600],
  MAINTENANCE: [800, 4500],
  SPARE_PARTS: [500, 3200],
  DIESEL: [400, 1800],
  TIPS: [50, 250],
  OTHER: [60, 300],
};

let seedN = 12345;
const rnd = (): number => {
  seedN = (seedN * 1103515245 + 12345) & 0x7fffffff;
  return seedN / 0x7fffffff;
};

async function receipt(code: string, amount: string, n: number): Promise<Buffer> {
  const w = 480;
  const h = 640;
  const lines = Array.from({ length: 6 }, (_, i) => `<rect x="40" y="${220 + i * 38}" width="${200 + Math.floor(rnd() * 180)}" height="10" fill="#9aa"/><rect x="380" y="${220 + i * 38}" width="60" height="10" fill="#9aa"/>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#fbfaf4"/>
  <rect x="0" y="0" width="${w}" height="90" fill="#e8e2c8"/><text x="40" y="58" font-size="32" font-family="Arial" fill="#333">RECEIPT #${1000 + n}</text>
  <text x="40" y="150" font-size="22" font-family="Arial" fill="#555">${code}</text>${lines}
  <line x1="40" y1="470" x2="440" y2="470" stroke="#444"/><text x="40" y="520" font-size="34" font-family="Arial" fill="#111">TOTAL  ${amount} EGP</text>
  <text x="40" y="590" font-size="16" font-family="Arial" fill="#999">demo sample image ${n}</text></svg>`;
  const jitter = Math.floor(rnd() * 6) - 3;
  return sharp(Buffer.from(svg)).rotate(jitter, { background: '#ffffff' }).jpeg({ quality: 70 }).toBuffer();
}

async function main(): Promise<void> {
  const prisma = createPrisma();
  try {
    if ((await prisma.request.count({ where: { clientKey: { startsWith: 'demo:' } } })) > 0) {
      console.log('seed:demo - demo requests already present, nothing to do');
      return;
    }
    registerExpenseModule();
    const storage = getStorage();
    const sys = { type: 'SYSTEM' as const };

    const cats = new Map((await prisma.lineCategory.findMany()).map((c) => [c.code, c]));
    const drivers = new Map((await prisma.submitter.findMany({ where: { kind: 'DRIVER' } })).map((s) => [s.code, s]));
    const roleUsers = async (roleCode: string, username?: string) => {
      const ur = await prisma.userRole.findFirst({ where: { role: { code: roleCode }, ...(username ? { user: { username } } : {}) } });
      if (!ur) throw new Error(`no user for role ${roleCode}`);
      const u = await loadAuthUser(prisma, ur.userId);
      if (!u) throw new Error('auth user');
      return u;
    };
    const mock = getSapAdapter('mock') as MockSapAdapter;

    /** approves every ACTIVE step (optionally stopping before step keys), as a user holding the step role */
    async function walk(requestId: string, stopBefore: string[] = [], max = 20, edit = false): Promise<void> {
      let edited = !edit;
      for (let i = 0; i < max; i++) {
        const active = await prisma.requestStepInstance.findMany({ where: { requestId, status: 'ACTIVE' }, include: { workflowStep: true, role: true } });
        const todo = active.filter((s) => !stopBefore.includes(s.stepKey));
        if (todo.length === 0) return;
        for (const s of todo) {
          const holder = await prisma.userRole.findFirst({ where: { roleId: s.roleId, user: { isActive: true } }, orderBy: { userId: 'asc' } });
          if (!holder) throw new Error(`no holder of role ${s.role.code}`);
          const user = (await loadAuthUser(prisma, holder.userId))!;
          const actor = { type: 'USER' as const, userId: user.id };
          const checklist: Record<string, boolean> = {};
          for (const c of (s.workflowStep.checklist as { key: string }[] | null) ?? []) checklist[c.key] = true;
          if (!edited && s.role.code === 'ACCOUNTANT') {
            const line = await prisma.requestLine.findFirst({ where: { requestId }, orderBy: { lineNo: 'asc' } });
            if (line && Number(line.amount) > 60) {
              await editLine(prisma, { requestId, lineId: line.id, stepInstanceId: s.id, user, amount: String(Math.round(Number(line.amount) * 0.9)), reason: 'Receipt amount differs slightly', actor });
              edited = true;
            }
          }
          await approveStep(prisma, { requestId, stepInstanceId: s.id, user, comment: 'OK', checklist, actionData: s.kind === 'PAYMENT' ? {} : undefined, actor });
        }
      }
    }

    let created = 0;
    for (const p of PLAN) {
      const driver = drivers.get(`DRV${String(p.driver).padStart(3, '0')}`);
      if (!driver) continue;
      const attachmentIds: string[][] = [];
      const lines = [];
      for (const code of p.lines) {
        const cat = cats.get(code)!;
        const [lo, hi] = AMOUNTS[code]!;
        const amount = String(Math.round(lo + rnd() * (hi - lo)));
        const att = await ingestAttachment(prisma, storage, { bytes: await receipt(code, amount, p.n * 10 + lines.length), originalName: `receipt-${p.n}.jpg`, uploadedBySubmitterId: driver.id });
        attachmentIds.push([att.id]);
        lines.push({
          categoryId: cat.id,
          amount,
          attachmentIds: [att.id],
          ...(code === 'DIESEL' ? { extraValues: { liters: String(Math.max(10, Math.round(Number(amount) / 25))) } } : {}),
        });
      }
      let res: { id: string; number: string };
      try {
        res = await submitRequest(
          prisma,
          { requestTypeCode: 'DRIVER_EXPENSE', channel: 'TELEGRAM', submitterId: driver.id, clientKey: `demo:${p.n}`, headerValues: { odometer: 60000 + p.n * 1300 + Math.floor(rnd() * 500) }, lines },
          { type: 'SUBMITTER', submitterId: driver.id },
        );
      } catch (e) {
        console.warn(`seed:demo - request ${p.n} skipped: ${(e as Error).message}`);
        continue;
      }
      created++;

      switch (p.scenario) {
        case 'SUP':
          await walk(res.id, [], 1);
          break;
        case 'MID':
          await walk(res.id, ['chief_accountant', 'general_manager', 'treasury']);
          break;
        case 'GM':
          await walk(res.id, ['general_manager', 'treasury'], 20, p.edit);
          break;
        case 'TREASURY':
          await walk(res.id, ['treasury']);
          break;
        case 'CORRECTION': {
          const step = await prisma.requestStepInstance.findFirstOrThrow({ where: { requestId: res.id, status: 'ACTIVE' } });
          const holder = await prisma.userRole.findFirstOrThrow({ where: { roleId: step.roleId } });
          const user = (await loadAuthUser(prisma, holder.userId))!;
          const line = await prisma.requestLine.findFirstOrThrow({ where: { requestId: res.id } });
          await requestCorrection(prisma, {
            requestId: res.id,
            stepInstanceId: step.id,
            user,
            items: [{ lineId: line.id, reasonCode: p.n % 2 ? 'IMAGE_UNCLEAR' : 'WRONG_AMOUNT', fixType: p.n % 2 ? 'REUPLOAD' : 'AMOUNT', comment: p.n % 2 ? 'The receipt photo is not clear' : 'Amount does not match the receipt' }],
            actor: { type: 'USER', userId: user.id },
          });
          break;
        }
        case 'REJECTED': {
          const step = await prisma.requestStepInstance.findFirstOrThrow({ where: { requestId: res.id, status: 'ACTIVE' } });
          const holder = await prisma.userRole.findFirstOrThrow({ where: { roleId: step.roleId } });
          const user = (await loadAuthUser(prisma, holder.userId))!;
          await rejectRequest(prisma, { requestId: res.id, stepInstanceId: step.id, user, reason: 'Not a company expense', actor: { type: 'USER', userId: user.id } });
          break;
        }
        case 'PAID':
        case 'PAID_SAP_FAILED': {
          if (p.scenario === 'PAID_SAP_FAILED') mock.failNext(100, 'SAP: connection refused (demo failure)');
          await walk(res.id, [], 20, p.edit);
          const posting = await prisma.sapPosting.findUnique({ where: { requestId: res.id } });
          if (posting) {
            try {
              await processSapPosting(prisma, posting.id, { trigger: 'AUTO' });
            } catch {
              /* a failed posting is recorded as FAILED on the row; that is the demo state */
            }
            // the seeded state is final: the worker must not pick these up again (retry stays available in the SAP monitor)
            await prisma.job.updateMany({ where: { dedupeKey: `sap.post:${res.id}` }, data: { status: p.scenario === 'PAID' ? 'DONE' : 'FAILED', finishedAt: new Date() } });
          }
          if (p.scenario === 'PAID_SAP_FAILED') mock.reset();
          break;
        }
        default:
          break;
      }

      // spread over the last ~30 days so reports and the dashboard have a history
      const ageDays = Math.floor(((p.n * 7) % 30) + rnd() * 2);
      const t = new Date(Date.now() - ageDays * 86400_000 - Math.floor(rnd() * 8) * 3600_000);
      await prisma.request.update({ where: { id: res.id }, data: { submittedAt: t, ...(p.scenario.startsWith('PAID') ? { paidAt: new Date(t.getTime() + 3 * 86400_000 > Date.now() ? Date.now() : t.getTime() + 3 * 86400_000) } : {}) } });
      await prisma.requestLine.updateMany({ where: { requestId: res.id }, data: { lineDate: t } });
    }
    void sys;
    console.log(`seed:demo - created ${created} demo requests (final PDFs are generated by the worker)`);
  } finally {
    await (prisma as PrismaClient).$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
