// Test harness: fake Telegram updates in, captured outgoing API calls out. Never touches the network.
import type { PrismaClient } from '@dms/db';
import { runDueJobs } from '@dms/core/jobs';
import type { StorageAdapter } from '@dms/core/storage';
import { createBot, type DmsBot } from '../bot';
import { createTelegramSendHandler } from '../jobs';

export interface SentButton {
  text: string;
  data: string;
}
export interface SentMessage {
  id: number;
  chatId: number;
  text: string;
  html: boolean;
  /** current inline keyboard (emptied once the bot removes it after a tap) */
  inline: SentButton[][];
  /** inline keyboard as first sent */
  origInline: SentButton[][];
  /** reply keyboard sent with this message ('remove' = removed) */
  reply?: { text: string; contact?: boolean }[][] | 'remove';
  at: Date;
}

export interface BotHarnessOptions {
  prisma: PrismaClient;
  storage: StorageAdapter;
  /** enable the per-user token bucket (off by default so long scripted flows are not throttled) */
  rateLimit?: { capacity: number; windowMs: number } | false;
  now?: () => Date;
}

let updateCounter = 1;
let messageCounter = 1000;

export interface HarnessUser {
  tgId: number;
  start(): Promise<void>;
  text(s: string): Promise<void>;
  contact(o: { phone: string; userId?: number }): Promise<void>;
  photo(bytes: Buffer): Promise<void>;
  document(bytes: Buffer, name: string, mime?: string): Promise<void>;
  /** tap an inline button (by label or callback data) or a reply-keyboard button (by label) */
  click(labelOrData: string, o?: { stale?: boolean }): Promise<void>;
  /** tap the inline button `data` of one specific message (what a real tap does) */
  clickOn(msgId: number, data: string): Promise<void>;
  /** the reply keyboard currently shown to this user (persists until the bot removes it) */
  replyKeyboard(): { text: string; contact?: boolean }[][] | undefined;
  sent(): SentMessage[];
  lastText(): string | undefined;
  /** all texts sent since the last call of this method */
  drain(): SentMessage[];
}

export function createBotHarness(opts: BotHarnessOptions) {
  const { prisma, storage } = opts;
  const files = new Map<string, { bytes: Buffer; fileName?: string }>();
  const messages = new Map<number, SentMessage[]>(); // chatId -> messages
  const replyKb = new Map<number, { text: string; contact?: boolean }[][] | undefined>();
  const drained = new Map<number, number>();
  const clock = { fixed: null as Date | null };
  const state = { failSends: null as null | { code: number; description: string }, apiCalls: [] as { method: string; payload: any }[] };
  let ready: Promise<void> | null = null;

  const bot: DmsBot = createBot({
    prisma,
    storage,
    token: '123456:TEST_TOKEN_NEVER_USED',
    botInfo: {
      id: 123456,
      is_bot: true,
      first_name: 'DMS Test Bot',
      username: 'dms_test_bot',
      can_join_groups: false,
      can_read_all_group_messages: false,
      supports_inline_queries: false,
      can_connect_to_business: false,
      has_main_web_app: false,
    } as never,
    downloadFile: async (fileId) => {
      const f = files.get(fileId);
      if (!f) throw new Error(`unknown fake file ${fileId}`);
      return f;
    },
    now: opts.now ?? (() => clock.fixed ?? new Date()),
    rateLimit: opts.rateLimit ?? false,
  });

  const toButtons = (km: any): SentButton[][] =>
    (km?.inline_keyboard ?? []).map((r: any[]) => r.map((b) => ({ text: b.text, data: b.callback_data })));

  bot.api.config.use(async (_prev, method, payload: any) => {
    state.apiCalls.push({ method, payload });
    if (method === 'sendMessage') {
      if (state.failSends) {
        const f = state.failSends;
        return { ok: false, error_code: f.code, description: f.description } as never;
      }
      const m: SentMessage = {
        id: ++messageCounter,
        chatId: Number(payload.chat_id),
        text: String(payload.text),
        html: payload.parse_mode === 'HTML',
        inline: toButtons(payload.reply_markup),
        origInline: toButtons(payload.reply_markup),
        at: new Date(),
      };
      const rm = payload.reply_markup;
      if (rm?.remove_keyboard) m.reply = 'remove';
      else if (rm?.keyboard) {
        m.reply = rm.keyboard.map((r: any[]) => r.map((b) => ({ text: b.text, contact: !!b.request_contact })));
      }
      if (m.reply) replyKb.set(m.chatId, m.reply === 'remove' ? undefined : m.reply);
      const list = messages.get(m.chatId) ?? [];
      list.push(m);
      messages.set(m.chatId, list);
      return {
        ok: true,
        result: { message_id: m.id, date: Math.floor(Date.now() / 1000), chat: { id: m.chatId, type: 'private' }, text: m.text },
      } as never;
    }
    if (method === 'editMessageReplyMarkup') {
      const m = messages.get(Number(payload.chat_id))?.find((x) => x.id === payload.message_id);
      if (m) m.inline = toButtons(payload.reply_markup);
      return { ok: true, result: true } as never;
    }
    return { ok: true, result: true } as never;
  });

  async function init() {
    ready ??= (async () => {
      const r = await prisma.botSession.aggregate({ _max: { lastUpdateId: true } });
      updateCounter = Math.max(updateCounter, (r._max.lastUpdateId ?? 0) + 1);
    })();
    await ready;
  }

  async function send(update: Record<string, unknown>) {
    await init();
    await bot.handleUpdate({ update_id: updateCounter++, ...update } as never);
  }

  function user(tgId: number, o: { username?: string } = {}): HarnessUser {
    const from = { id: tgId, is_bot: false, first_name: `User${tgId}`, username: o.username };
    const chat = { id: tgId, type: 'private' };
    const msg = (extra: Record<string, unknown>) => ({
      message: { message_id: ++messageCounter, date: Math.floor(Date.now() / 1000), chat, from, ...extra },
    });
    const self: HarnessUser = {
      tgId,
      start: () => self.text('/start'),
      text: (s) => send(msg({ text: s })),
      contact: ({ phone, userId }) =>
        send(msg({ contact: { phone_number: phone, first_name: from.first_name, user_id: userId ?? tgId } })),
      photo: (bytes) => {
        const id = `photo-${++messageCounter}`;
        files.set(id, { bytes });
        return send(msg({ photo: [{ file_id: id, file_unique_id: `u-${id}`, width: 800, height: 600, file_size: bytes.length }] }));
      },
      document: (bytes, name, mime) => {
        const id = `doc-${++messageCounter}`;
        files.set(id, { bytes, fileName: name });
        return send(
          msg({
            document: {
              file_id: id,
              file_unique_id: `u-${id}`,
              file_name: name,
              mime_type: mime ?? (name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg'),
              file_size: bytes.length,
            },
          }),
        );
      },
      click: async (x, co = {}) => {
        const list = messages.get(tgId) ?? [];
        for (const fuzzy of [false, true]) {
         for (let i = list.length - 1; i >= 0; i--) {
          const m = list[i]!;
          const kb = co.stale ? m.origInline : m.inline;
          for (const row of kb) {
            const b = row.find((bb) => bb.text === x || bb.data === x || (fuzzy && bb.text.includes(x)));
            if (b) {
              await send({
                callback_query: {
                  id: `cb-${++messageCounter}`,
                  from,
                  chat_instance: 'harness',
                  data: b.data,
                  message: { message_id: m.id, date: Math.floor(m.at.getTime() / 1000), chat, text: m.text, from: { id: 123456, is_bot: true, first_name: 'bot' } },
                },
              });
              return;
            }
          }
         }
        }
        const rk = replyKb.get(tgId);
        if (rk && rk.some((r) => r.some((b) => b.text === x || (x.length > 2 && b.text.startsWith(x))))) {
          const label = rk.flat().find((b) => b.text === x || b.text.startsWith(x))!.text;
          return self.text(label);
        }
        const avail = list.slice(-3).flatMap((m) => m.inline.flat().map((b) => b.text));
        throw new Error(`harness: button "${x}" not found (inline now: ${avail.join(' | ')})`);
      },
      clickOn: async (msgId, data) => {
        const m = (messages.get(tgId) ?? []).find((x) => x.id === msgId);
        await send({
          callback_query: {
            id: `cb-${++messageCounter}`,
            from,
            chat_instance: 'harness',
            data,
            message: { message_id: msgId, date: Math.floor(Date.now() / 1000), chat, text: m?.text ?? '', from: { id: 123456, is_bot: true, first_name: 'bot' } },
          },
        });
      },
      replyKeyboard: () => replyKb.get(tgId),
      sent: () => messages.get(tgId) ?? [],
      lastText: () => messages.get(tgId)?.at(-1)?.text,
      drain: () => {
        const list = messages.get(tgId) ?? [];
        const from0 = drained.get(tgId) ?? 0;
        drained.set(tgId, list.length);
        return list.slice(from0);
      },
    };
    return self;
  }

  const handlers = () => ({ 'telegram.send': createTelegramSendHandler(bot.api as never) });

  return {
    bot,
    user,
    sent: (tgId: number) => messages.get(tgId) ?? [],
    lastText: (tgId: number) => messages.get(tgId)?.at(-1)?.text,
    /** delivers pending `telegram.send` jobs (notifications to drivers) through the fake API */
    flushTelegramJobs: async (): Promise<number> => runDueJobs({ prisma, queues: ['telegram'], handlers: handlers() }),
    handlers,
    setNow: (d: Date | null) => (clock.fixed = d),
    failSends: (f: { code: number; description: string } | null) => (state.failSends = f),
    apiCalls: state.apiCalls,
    /** Registered fake files (file_id -> bytes), e.g. for the simulator */
    files,
  };
}

export type BotHarness = ReturnType<typeof createBotHarness>;
