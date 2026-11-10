import { randomBytes } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';
import { setupTestDb, type TestDb } from '@dms/db/testing';
import { createLocalStorage } from '@dms/core/storage';
import { createBotHarness, type BotHarness, type BotHarnessOptions, type HarnessUser } from '../src/testing/harness';

export interface Env {
  db: TestDb;
  prisma: TestDb['prisma'];
  h: BotHarness;
  storage: ReturnType<typeof createLocalStorage>;
}

export async function setup(tag: string, o: Partial<Omit<BotHarnessOptions, 'prisma' | 'storage'>> = {}): Promise<Env> {
  const db = await setupTestDb(tag);
  const storage = createLocalStorage(mkdtempSync(join(tmpdir(), 'dms-bot-')));
  const h = createBotHarness({ prisma: db.prisma, storage, ...o });
  return { db, prisma: db.prisma, h, storage };
}

/** Random-noise PNG (no sharp dependency in this package): every call gives a different image. */
export async function jpeg(): Promise<Buffer> {
  const w = 96;
  const rows: Buffer[] = [];
  for (let y = 0; y < w; y++) rows.push(Buffer.concat([Buffer.from([0]), randomBytes(w * 3)]));
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(w, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');

export function phoneOf(n: number): string {
  return `+2010000000${String(n).padStart(2, '0')}`;
}

/** Links the seeded driver DRV0nn to a fake telegram user. */
export async function linkDriver(h: BotHarness, n: number, tgId = 5000 + n): Promise<HarnessUser> {
  const u = h.user(tgId);
  await u.start();
  await u.contact({ phone: phoneOf(n) });
  return u;
}

/** Walks CONFIRM_VEHICLE -> ODOMETER -> CHOOSE_TYPE. */
export async function beginRequest(u: HarnessUser, odometer = '100000'): Promise<void> {
  await u.click('طلب جديد');
  await u.click('أيوه');
  await u.text(odometer);
}

export async function addLine(u: HarnessUser, type: string, amount: string, photos = 1, extra: string[] = []): Promise<void> {
  await u.click(type);
  await u.text(amount);
  for (const e of extra) await u.text(e);
  for (let i = 0; i < photos; i++) await u.photo(await jpeg());
  await u.click('خلصت صور');
}

/** The last `n` bot messages joined (a reply is often followed by a re-prompt). */
export function tail(u: HarnessUser, n = 2): string {
  return u
    .sent()
    .slice(-n)
    .map((m) => m.text)
    .join('\n---\n');
}
