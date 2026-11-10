import { Bot, type Context } from 'grammy';
import type { UserFromGetMe } from 'grammy/types';
import { Prisma, type PrismaClient } from '@dms/db';
import { getSetting } from '@dms/core/config';
import type { StorageAdapter } from '@dms/core/storage';
import { handleInput, type FlowDeps, type Session } from './flow';
import { M } from './messages';
import type { BotDraft, CorrectionCtx, Input, Out, SayOptions, State } from './types';

export interface BotDeps {
  prisma: PrismaClient;
  storage: StorageAdapter;
  token: string;
  botInfo?: UserFromGetMe;
  downloadFile(fileId: string): Promise<{ bytes: Buffer; fileName?: string }>;
  now?(): Date;
  /** token bucket per user; default 20 updates / 10 s; `false` disables (test harness) */
  rateLimit?: { capacity: number; windowMs: number } | false;
}

export type DmsBot = Bot<Context> & { deps: FlowDeps };

function toInput(ctx: Context): Input | null {
  const cq = ctx.callbackQuery;
  if (cq) return typeof cq.data === 'string' ? { kind: 'cb', data: cq.data } : null;
  const m = ctx.message;
  if (!m) return null;
  if (m.contact) return { kind: 'contact', phone: m.contact.phone_number, userId: m.contact.user_id };
  if (m.photo?.length) {
    const p = m.photo[m.photo.length - 1]!;
    return { kind: 'file', fileId: p.file_id, uniqueId: p.file_unique_id, mime: 'image/jpeg', isPhoto: true };
  }
  if (m.document) {
    return {
      kind: 'file',
      fileId: m.document.file_id,
      uniqueId: m.document.file_unique_id,
      name: m.document.file_name,
      mime: m.document.mime_type,
      isPhoto: false,
    };
  }
  if (typeof m.text === 'string') return { kind: 'text', text: m.text };
  return { kind: 'other' };
}

function makeOut(ctx: Context, chatId: number): Out {
  return {
    async say(text, o: SayOptions = {}) {
      const opts: Record<string, unknown> = {};
      if (o.html) opts.parse_mode = 'HTML';
      if (o.inline) {
        opts.reply_markup = { inline_keyboard: o.inline.map((r) => r.map((b) => ({ text: b.text, callback_data: b.data }))) };
      } else if (o.reply === 'remove') {
        opts.reply_markup = { remove_keyboard: true };
      } else if (o.reply) {
        const hasContact = o.reply.some((r) => r.some((b) => 'contact' in b));
        opts.reply_markup = {
          keyboard: o.reply.map((r) =>
            r.map((b) => ('contact' in b ? { text: b.text, request_contact: true } : { text: b.text })),
          ),
          resize_keyboard: true,
          is_persistent: !hasContact,
          one_time_keyboard: hasContact,
        };
      }
      await ctx.api.sendMessage(chatId, text, opts);
    },
    async ack(text) {
      if (ctx.callbackQuery) await ctx.answerCallbackQuery(text ? { text } : undefined).catch(() => undefined);
    },
  };
}

export function createBot(deps: BotDeps): DmsBot {
  const { prisma } = deps;
  const now = deps.now ?? (() => new Date());
  const flowDeps: FlowDeps = { prisma, storage: deps.storage, downloadFile: deps.downloadFile, now };
  const bot = new Bot<Context>(deps.token, deps.botInfo ? { botInfo: deps.botInfo } : undefined) as DmsBot;
  bot.deps = flowDeps;

  // ---- per-user serialisation + rate limit ----
  const queues = new Map<number, Promise<void>>();
  const buckets = new Map<number, { tokens: number; at: number; warnedAt: number }>();
  const rl = deps.rateLimit === undefined ? { capacity: 20, windowMs: 10_000 } : deps.rateLimit;

  bot.use(async (ctx, next) => {
    const uid = ctx.from?.id;
    if (!uid) return;
    const prev = queues.get(uid) ?? Promise.resolve();
    let release!: () => void;
    const mine = new Promise<void>((r) => (release = r));
    const tail = prev.then(() => mine);
    queues.set(uid, tail);
    await prev;
    try {
      await next();
    } finally {
      release();
      if (queues.get(uid) === tail) queues.delete(uid);
    }
  });

  bot.use(async (ctx, next) => {
    if (!rl) return next();
    const uid = ctx.from!.id;
    const t = now().getTime();
    const b = buckets.get(uid) ?? { tokens: rl.capacity, at: t, warnedAt: 0 };
    b.tokens = Math.min(rl.capacity, b.tokens + ((t - b.at) / rl.windowMs) * rl.capacity);
    b.at = t;
    buckets.set(uid, b);
    if (b.tokens < 1) {
      if (t - b.warnedAt > rl.windowMs && ctx.chat) {
        b.warnedAt = t;
        await ctx.api.sendMessage(ctx.chat.id, M.rateLimited).catch(() => undefined);
      }
      if (ctx.callbackQuery) await ctx.answerCallbackQuery().catch(() => undefined);
      return;
    }
    b.tokens -= 1;
    return next();
  });

  bot.use(async (ctx) => {
    const from = ctx.from!;
    const chat = ctx.chat ?? ctx.callbackQuery?.message?.chat;
    if (!chat || chat.type !== 'private') return;
    const input = toInput(ctx);
    if (!input) return;
    const updateId = ctx.update.update_id;

    let row = await prisma.botSession.upsert({
      where: { telegramUserId: BigInt(from.id) },
      create: { telegramUserId: BigInt(from.id), chatId: BigInt(chat.id) },
      update: { chatId: BigInt(chat.id) },
    });
    if (row.lastUpdateId !== null && updateId <= row.lastUpdateId) return; // redelivered

    const s: Session = {
      id: row.id,
      submitterId: row.submitterId,
      state: row.state as State,
      draft: (row.draft as unknown as BotDraft | null) ?? null,
      correction: (row.correction as unknown as CorrectionCtx | null) ?? null,
      draftExpiresAt: row.draftExpiresAt,
    };
    const before = JSON.stringify({ d: s.draft, st: s.state, c: s.correction, sub: s.submitterId });
    const beforeDraft = JSON.stringify(s.draft);
    const out = makeOut(ctx, chat.id);

    // The tapped keyboard disappears so a double tap cannot act twice.
    const cqMsg = ctx.callbackQuery?.message;
    if (cqMsg) {
      await ctx.api.editMessageReplyMarkup(chat.id, cqMsg.message_id, { reply_markup: { inline_keyboard: [] } }).catch(() => undefined);
    }

    let failed = false;
    try {
      await handleInput(flowDeps, s, { id: from.id, username: from.username }, input, out);
    } catch (e) {
      failed = true;
      console.error('[bot] update failed', e);
      await out.say(M.error).catch(() => undefined);
    }

    const data: Prisma.BotSessionUncheckedUpdateInput = { lastUpdateId: updateId };
    if (!failed && before !== JSON.stringify({ d: s.draft, st: s.state, c: s.correction, sub: s.submitterId })) {
      data.state = s.state;
      data.submitterId = s.submitterId;
      data.draft = s.draft ? (s.draft as unknown as Prisma.InputJsonValue) : Prisma.DbNull;
      data.correction = s.correction ? (s.correction as unknown as Prisma.InputJsonValue) : Prisma.DbNull;
      if (!s.draft) {
        data.draftStartedAt = null;
        data.draftUpdatedAt = null;
        data.draftExpiresAt = null;
        data.draftReminderSentAt = null;
      } else if (JSON.stringify(s.draft) !== beforeDraft || !row.draftExpiresAt) {
        const hours = await getSetting(prisma, 'bot.draftExpiryHours').catch(() => 24);
        const t = now();
        data.draftStartedAt = row.draftStartedAt ?? new Date(s.draft.startedAt);
        data.draftUpdatedAt = t;
        data.draftExpiresAt = new Date(t.getTime() + Number(hours) * 3600_000);
        data.draftReminderSentAt = null;
      }
    }
    row = await prisma.botSession.update({ where: { id: s.id }, data });
  });

  bot.catch((err) => console.error('[bot] unhandled', err.error));
  return bot;
}
