// Local "Driver simulator": a mobile-looking RTL chat page served by the bot app itself (BOT_SIMULATOR=1).
// It feeds fake Telegram updates through the SAME bot instance (createBot) and the SAME core/DB, so requests
// created here are real requests that approvers see. No Telegram token and no network access are used.
import { existsSync, readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { join } from 'node:path';
import { createPrisma, loadEnv, type PrismaClient } from '@dms/db';
import type { StorageAdapter } from '@dms/core/storage';
import { getStorage } from '@dms/core/storage';
import { createBotHarness, type HarnessUser } from '../testing/harness';

const SIM_TG_BASE = 8_000_000; // simulated telegram user id = base + driver number (never a real id)
const MAX_UPLOAD = 16 * 1024 * 1024;

type LogEntry = { kind: 'user'; text: string; at: number } | { kind: 'bot'; id: number };

function readBody(req: IncomingMessage, limit = MAX_UPLOAD): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let n = 0;
    req.on('data', (c: Buffer) => {
      n += c.length;
      if (n > limit) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

function loadPage(): string {
  const candidates = [join(__dirname, 'page.html'), join(process.cwd(), 'src/simulator/page.html'), join(process.cwd(), 'apps/bot/src/simulator/page.html')];
  for (const c of candidates) if (existsSync(c)) return readFileSync(c, 'utf8');
  throw new Error('simulator page.html not found');
}

export async function startSimulator(
  o: { port?: number; host?: string; prisma?: PrismaClient; storage?: StorageAdapter } = {},
): Promise<{ close(): Promise<void>; port: number }> {
  loadEnv();
  const port = o.port ?? Number(process.env.BOT_SIMULATOR_PORT ?? 3010);
  const host = o.host ?? '127.0.0.1'; // never exposed beyond this machine
  const prisma = o.prisma ?? createPrisma();
  const storage = o.storage ?? getStorage();
  const harness = createBotHarness({ prisma, storage });
  const logs = new Map<number, LogEntry[]>();
  const users = new Map<number, HarnessUser>();
  const consumed = new Map<number, number>();

  const tgIdOf = (code: string): number => {
    const n = /^DRV0*(\d+)$/.exec(code)?.[1];
    if (!n) throw new Error('unknown driver');
    return SIM_TG_BASE + Number(n);
  };
  const userFor = (tgId: number): HarnessUser => {
    let u = users.get(tgId);
    if (!u) users.set(tgId, (u = harness.user(tgId, { username: `sim${tgId - SIM_TG_BASE}` })));
    return u;
  };
  const logFor = (tgId: number): LogEntry[] => {
    let l = logs.get(tgId);
    if (!l) logs.set(tgId, (l = []));
    return l;
  };
  /** moves messages the bot sent since the last call into the visible log */
  const collect = (tgId: number): void => {
    const all = userFor(tgId).sent();
    const from = consumed.get(tgId) ?? 0;
    for (const m of all.slice(from)) logFor(tgId).push({ kind: 'bot', id: m.id });
    consumed.set(tgId, all.length);
  };
  const view = (tgId: number) => {
    collect(tgId);
    const u = userFor(tgId);
    const byId = new Map(u.sent().map((m) => [m.id, m]));
    return {
      entries: logFor(tgId).map((e) =>
        e.kind === 'user'
          ? e
          : (() => {
              const m = byId.get(e.id)!;
              return { kind: 'bot', id: m.id, text: m.text, html: m.html, inline: m.inline, reply: m.reply ?? null };
            })(),
      ),
      replyKeyboard: u.replyKeyboard() ?? null,
    };
  };

  // Telegram notifications to drivers (e.g. correction requests, vehicle-change decisions) are delivered here
  // exactly as the real bot process would deliver them, through the telegram job queue.
  const pump = setInterval(() => {
    harness.flushTelegramJobs().catch(() => undefined);
  }, 1500);
  pump.unref();

  const page = loadPage();
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', `http://${host}`);
      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        res.end(process.env.NODE_ENV === 'production' ? page : loadPage());
        return;
      }
      if (req.method === 'GET' && url.pathname === '/api/drivers') {
        const rows = await prisma.submitter.findMany({
          where: { kind: 'DRIVER', isActive: true },
          orderBy: { code: 'asc' },
          include: { vehicleAssignments: { where: { validTo: null }, include: { vehicle: true }, take: 1 } },
        });
        json(res, 200, rows.map((r) => ({
          code: r.code,
          name: r.fullName,
          phone: r.phone,
          linked: r.telegramUserId !== null,
          simulated: r.telegramUserId === null || Number(r.telegramUserId) === tgIdOf(r.code),
          vehicle: r.vehicleAssignments[0]?.vehicle.number ?? null,
        })));
        return;
      }
      const code = url.searchParams.get('driver') ?? '';
      if (url.pathname.startsWith('/api/') && url.pathname !== '/api/drivers') {
        const tgId = tgIdOf(code);
        const u = userFor(tgId);
        if (req.method === 'GET' && url.pathname === '/api/log') {
          json(res, 200, view(tgId));
          return;
        }
        if (req.method === 'POST' && url.pathname === '/api/upload') {
          const bytes = await readBody(req);
          const name = url.searchParams.get('name') ?? 'photo.jpg';
          const mime = url.searchParams.get('mime') ?? 'image/jpeg';
          collect(tgId);
          logFor(tgId).push({ kind: 'user', text: `📎 ${name}`, at: Date.now() });
          if (mime.startsWith('image/') && !name.toLowerCase().endsWith('.pdf')) await u.photo(bytes);
          else await u.document(bytes, name, mime);
          json(res, 200, view(tgId));
          return;
        }
        if (req.method === 'POST' && url.pathname === '/api/send') {
          const body = JSON.parse((await readBody(req, 64 * 1024)).toString('utf8')) as {
            type: 'text' | 'click' | 'contact' | 'reset';
            text?: string;
            msgId?: number;
            data?: string;
            mode?: 'own' | 'foreign';
          };
          collect(tgId);
          const log = logFor(tgId);
          if (body.type === 'text') {
            log.push({ kind: 'user', text: String(body.text ?? ''), at: Date.now() });
            await u.text(String(body.text ?? ''));
          } else if (body.type === 'click' && body.msgId && body.data) {
            await u.clickOn(body.msgId, body.data);
          } else if (body.type === 'contact') {
            const sub = await prisma.submitter.findUnique({ where: { code } });
            if (!sub) throw new Error('unknown driver');
            const foreign = body.mode === 'foreign';
            log.push({ kind: 'user', text: foreign ? `👤 جهة اتصال شخص تاني (${sub.phone})` : `📱 ${sub.phone}`, at: Date.now() });
            await u.contact({ phone: sub.phone, userId: foreign ? 424242 : undefined });
          } else if (body.type === 'reset') {
            // demo helper: forget this simulated telegram account so onboarding can be replayed
            await prisma.submitter.updateMany({
              where: { code, telegramUserId: BigInt(tgId) },
              data: { telegramUserId: null, telegramChatId: null, telegramLinkedAt: null },
            });
            await prisma.botSession.deleteMany({ where: { telegramUserId: BigInt(tgId) } });
            logs.set(tgId, []);
            consumed.set(tgId, u.sent().length);
          }
          json(res, 200, view(tgId));
          return;
        }
      }
      json(res, 404, { error: 'not found' });
    } catch (e) {
      console.error('[sim]', e);
      json(res, 500, { error: (e as Error).message });
    }
  });

  await new Promise<void>((resolve) => server.listen(port, host, resolve));
  console.log(`Driver simulator: http://${host}:${(server.address() as { port: number }).port}  (same bot, same database as the real bot)`);
  return {
    port: (server.address() as { port: number }).port,
    close: async () => {
      clearInterval(pump);
      await new Promise<void>((r) => server.close(() => r()));
      if (!o.prisma) await prisma.$disconnect();
    },
  };
}
