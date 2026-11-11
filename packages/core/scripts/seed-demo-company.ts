// Company demo seed (D3). Runs against dms_demo with the demo env set by scripts/demo-company.ts:
//   1. base seed + signature files (seedBase / seedSignatureFiles)
//   2. company name + receipts toggle in the default expense-sheet template, Telegram notifications to users enabled
//   3. DRV001 copied from the MAIN database (name, phone, Telegram link) so the owner's phone stays linked
//   4. admin delegations: admin can approve every step alone (signature stamped "on behalf of <role holder>")
//   5. exactly 3 tidy sample requests through the REAL engine with realistic receipt images (DRV002, DRV003, DRV004)
//   6. every Telegram notification created by the seed is marked SKIPPED ('demo seed')
// Idempotent: when any request exists, the requests step does nothing (reset = drop the database and reseed).
import { createPrisma, findRepoRoot, loadEnv, PrismaClient } from '@dms/db';
import { isAbsolute, resolve } from 'node:path';
import { SETTING_DEFAULTS } from '@dms/shared';
import { seedBase, seedSignatureFiles } from '../../db/prisma/seed';
import { audit } from '../src/audit';
import { approveStep, editLine, submitRequest } from '../src/engine';
import { registerExpenseModule } from '../src/expense';
import { ingestAttachment } from '../src/media';
import { loadAuthUser } from '../src/rbac';
import { processSapPosting } from '../src/sap';
import { getStorage } from '../src/storage';
import { launchBrowser, renderReceipt, type ReceiptSpec } from './seed-demo-company-receipts';

loadEnv();

const COMPANY = process.env.DEMO_COMPANY_NAME || 'MSR';
const MAIN_URL = 'postgresql://postgres@localhost:54329/dms';
const APPROVERS = ['supervisor', 'engineer', 'shipping', 'manager', 'accountant1', 'chief', 'gm', 'treasury'];

function today(daysAgo: number): string {
  const d = new Date(Date.now() - daysAgo * 86400_000);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

async function configure(prisma: PrismaClient): Promise<void> {
  const tv = await prisma.templateVersion.findFirst({ where: { status: 'ACTIVE', template: { code: 'EXPENSE_SHEET' } }, orderBy: { version: 'desc' } });
  if (tv) {
    const config = { ...((tv.config as Record<string, unknown> | null) ?? {}), companyNameAr: COMPANY, includeReceipts: true };
    await prisma.templateVersion.update({ where: { id: tv.id }, data: { config: config as never } });
  }
  const prof = SETTING_DEFAULTS['company.profile'];
  const cur = await prisma.setting.findUnique({ where: { key: 'company.profile' } });
  await prisma.setting.upsert({
    where: { key: 'company.profile' },
    create: { key: 'company.profile', value: { ...prof, nameAr: COMPANY, nameEn: COMPANY } as never },
    update: { value: { ...prof, ...((cur?.value as object | null) ?? {}), nameAr: COMPANY, nameEn: COMPANY } as never },
  });
  const tg = SETTING_DEFAULTS['notifications.telegramUsers'];
  const curTg = await prisma.setting.findUnique({ where: { key: 'notifications.telegramUsers' } });
  await prisma.setting.upsert({
    where: { key: 'notifications.telegramUsers' },
    create: { key: 'notifications.telegramUsers', value: { ...tg, enabled: true } as never },
    update: { value: { ...tg, ...((curTg?.value as object | null) ?? {}), enabled: true } as never },
  });
}

/** Copies DRV001 (name, phone, Telegram link) from the main database. Warns and keeps the base values on any problem. */
async function copyDriverFromMain(prisma: PrismaClient): Promise<void> {
  const main = new PrismaClient({ datasourceUrl: MAIN_URL });
  try {
    const src = await main.submitter.findUnique({ where: { code: 'DRV001' } });
    if (!src) return void console.warn('WARNING: DRV001 not found in the main database - keeping base seed values');
    if (src.telegramUserId === null) console.warn('WARNING: DRV001 has no Telegram link in the main database - link it from /master/drivers or the bot');
    const taken = await prisma.submitter.findFirst({ where: { phone: src.phone, code: { not: 'DRV001' } } });
    if (taken) return void console.warn(`WARNING: phone ${src.phone} already belongs to ${taken.code} in the demo database - DRV001 not updated`);
    await prisma.submitter.update({
      where: { code: 'DRV001' },
      data: {
        fullName: src.fullName,
        phone: src.phone,
        ...(src.telegramUserId !== null
          ? { telegramUserId: src.telegramUserId, telegramChatId: src.telegramChatId, telegramUsername: src.telegramUsername, telegramLinkedAt: src.telegramLinkedAt }
          : {}),
      },
    });
    console.log(`seed:demo-company - DRV001 copied from the main database (${src.fullName}, Telegram ${src.telegramUserId !== null ? 'linked' : 'not linked'})`);
  } catch (e) {
    console.warn(`WARNING: could not read the main database to copy DRV001 (${(e as Error).message.split('\n').pop()}) - keeping base seed values`);
  } finally {
    await main.$disconnect().catch(() => undefined);
  }
}

async function seedDelegations(prisma: PrismaClient): Promise<void> {
  const admin = await prisma.user.findUniqueOrThrow({ where: { username: 'admin' } });
  const now = Date.now();
  for (const username of APPROVERS) {
    const from = await prisma.user.findUnique({ where: { username } });
    if (!from) continue;
    const existing = await prisma.delegation.findFirst({ where: { fromUserId: from.id, toUserId: admin.id, revokedAt: null, endsAt: { gt: new Date() } } });
    if (existing) continue;
    await prisma.$transaction(async (tx) => {
      const startsAt = new Date(now - 86400_000);
      const endsAt = new Date(now + 2 * 365 * 86400_000);
      const d = await tx.delegation.create({
        data: { fromUserId: from.id, toUserId: admin.id, roleId: null, startsAt, endsAt, reason: 'Demo: admin approves every step', createdById: admin.id },
      });
      await audit(tx, {
        actor: { type: 'USER', userId: admin.id },
        action: 'delegation.create',
        entityType: 'Delegation',
        entityId: d.id,
        after: { fromUserId: from.id, toUserId: admin.id, roleId: null, startsAt, endsAt },
      });
    });
  }
}

interface Line {
  code: string;
  amount: number;
  liters?: number;
  receipt: Omit<ReceiptSpec, 'amount' | 'no' | 'date'>;
}

const WAIT_AT_ACCOUNTANT = ['accountant', 'chief_accountant', 'general_manager', 'treasury'];

async function createRequests(prisma: PrismaClient): Promise<void> {
  if ((await prisma.request.count()) > 0) {
    console.log('seed:demo-company - requests already present, nothing to do');
    return;
  }
  registerExpenseModule();
  const storage = getStorage();
  const cats = new Map((await prisma.lineCategory.findMany()).map((c) => [c.code, c]));
  const browser = await launchBrowser();

  async function walk(requestId: string, stopBefore: string[] = [], editFirstLine = false): Promise<void> {
    let edited = !editFirstLine;
    for (let i = 0; i < 20; i++) {
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
          if (line) {
            await editLine(prisma, { requestId, lineId: line.id, stepInstanceId: s.id, user, amount: String(Math.round(Number(line.amount) * 0.9)), reason: 'Receipt amount differs slightly', actor });
            edited = true;
          }
        }
        await approveStep(prisma, { requestId, stepInstanceId: s.id, user, comment: 'OK', checklist, actionData: s.kind === 'PAYMENT' ? {} : undefined, actor });
      }
    }
  }

  const PLAN: { n: number; driver: string; daysAgo: number; odometer: number; lines: Line[]; scenario: 'SUP' | 'ACCOUNTANT' | 'PAID' }[] = [
    {
      n: 1, driver: 'DRV002', daysAgo: 0, odometer: 84210, scenario: 'SUP',
      lines: [
        { code: 'TOLLS', amount: 25, receipt: { kind: 'إيصال', merchant: 'بوابة رسوم الطريق الدائري', place: 'بوابة العاشر من رمضان', items: [{ label: 'رسوم عبور - نقل ثقيل', value: '25.00' }], stamp: 'هيئة الطرق' } },
        { code: 'WEIGHBRIDGE', amount: 60, receipt: { kind: 'إيصال', merchant: 'ميزان البسطة', place: 'طريق القاهرة - السويس', items: [{ label: 'وزن شاحنة', value: '1 x 60.00' }], stamp: 'ميزان البسطة' } },
      ],
    },
    {
      n: 2, driver: 'DRV003', daysAgo: 1, odometer: 51730, scenario: 'ACCOUNTANT',
      lines: [
        { code: 'DIESEL', amount: 500, liters: 40, receipt: { kind: 'فاتورة', merchant: 'محطة وطنية للبترول', place: 'طريق مصر - الإسكندرية الصحراوي', items: [{ label: 'سولار', value: '40 لتر' }, { label: 'سعر اللتر', value: '12.50' }], stamp: 'محطة وطنية' } },
        { code: 'MAINTENANCE', amount: 1200, receipt: { kind: 'فاتورة', merchant: 'ورشة الأمل لصيانة الشاحنات', place: 'المنطقة الصناعية - 6 أكتوبر', items: [{ label: 'تغيير زيت المحرك', value: '650.00' }, { label: 'فلتر زيت + فلتر سولار', value: '350.00' }, { label: 'مصنعية', value: '200.00' }], stamp: 'ورشة الأمل' } },
        { code: 'TIPS', amount: 50, receipt: { kind: 'إيصال', merchant: 'إيصال استلام إكرامية', place: 'ساحة التحميل', items: [{ label: 'إكرامية تحميل', value: '50.00' }], stamp: 'استلمت' } },
      ],
    },
    {
      n: 3, driver: 'DRV004', daysAgo: 3, odometer: 66405, scenario: 'PAID',
      lines: [
        { code: 'TOLLS', amount: 30, receipt: { kind: 'إيصال', merchant: 'بوابة رسوم طريق الإسماعيلية', place: 'بوابة بلبيس', items: [{ label: 'رسوم عبور', value: '30.00' }], stamp: 'هيئة الطرق' } },
        { code: 'SPARE_PARTS', amount: 2200, receipt: { kind: 'فاتورة', merchant: 'الشرق لقطع غيار السيارات', place: 'شارع الجيش - القاهرة', items: [{ label: 'طقم تيل فرامل أمامي', value: '1,300.00' }, { label: 'طقم تيل فرامل خلفي', value: '900.00' }], stamp: 'الشرق' } },
      ],
    },
  ];

  try {
    for (const p of PLAN) {
      const driver = await prisma.submitter.findUniqueOrThrow({ where: { code: p.driver } });
      const lines = [];
      let k = 0;
      for (const l of p.lines) {
        const bytes = await renderReceipt(browser, { ...l.receipt, amount: l.amount, no: 4000 + p.n * 17 + k * 5, date: today(p.daysAgo), tilt: [-2, 1.5, -1, 2][(p.n + k) % 4] });
        const att = await ingestAttachment(prisma, storage, { bytes, originalName: `receipt-${p.n}-${k + 1}.jpg`, uploadedBySubmitterId: driver.id });
        lines.push({
          categoryId: cats.get(l.code)!.id,
          amount: String(l.amount),
          attachmentIds: [att.id],
          ...(l.liters ? { extraValues: { liters: String(l.liters) } } : {}),
        });
        k++;
      }
      const res = await submitRequest(
        prisma,
        { requestTypeCode: 'DRIVER_EXPENSE', channel: 'TELEGRAM', submitterId: driver.id, clientKey: `democo:${p.n}`, headerValues: { odometer: p.odometer }, lines },
        { type: 'SUBMITTER', submitterId: driver.id },
      );
      if (p.scenario === 'ACCOUNTANT') await walk(res.id, WAIT_AT_ACCOUNTANT);
      if (p.scenario === 'PAID') {
        await walk(res.id);
        const posting = await prisma.sapPosting.findUnique({ where: { requestId: res.id } });
        if (posting) {
          try {
            await processSapPosting(prisma, posting.id, { trigger: 'AUTO' });
          } catch {
            /* recorded on the posting row */
          }
          await prisma.job.updateMany({ where: { dedupeKey: `sap.post:${res.id}` }, data: { status: 'DONE', finishedAt: new Date() } });
        }
      }
      const t = new Date(Date.now() - p.daysAgo * 86400_000 - 2 * 3600_000);
      await prisma.request.update({ where: { id: res.id }, data: { submittedAt: t, ...(p.scenario === 'PAID' ? { paidAt: new Date(t.getTime() + 2 * 86400_000 > Date.now() ? Date.now() : t.getTime() + 2 * 86400_000) } : {}) } });
      await prisma.requestLine.updateMany({ where: { requestId: res.id }, data: { lineDate: t } });
    }
    console.log('seed:demo-company - created 3 sample requests (the final PDF of the paid one is generated by the worker)');
  } finally {
    await browser.close().catch(() => undefined);
  }
}

async function main(): Promise<void> {
  const prisma = createPrisma();
  try {
    const storageRoot = process.env.STORAGE_ROOT || './storage-demo';
    await seedBase(prisma, { storageRoot });
    await seedSignatureFiles(isAbsolute(storageRoot) ? storageRoot : resolve(findRepoRoot(), storageRoot), prisma);
    await configure(prisma);
    await copyDriverFromMain(prisma);
    await seedDelegations(prisma);
    await createRequests(prisma);
    // nobody gets a message because of seeding: skip every Telegram notification (and its job) created so far
    const n = await prisma.notification.updateMany({ where: { channel: 'TELEGRAM', status: { in: ['PENDING', 'FAILED'] } }, data: { status: 'SKIPPED', error: 'demo seed' } });
    await prisma.job.updateMany({ where: { queue: 'telegram', status: { in: ['PENDING', 'FAILED'] } }, data: { status: 'DONE', finishedAt: new Date() } });
    console.log(`seed:demo-company - done (${n.count} Telegram notifications marked SKIPPED)`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
