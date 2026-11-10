import { createServer } from 'node:http';
import { webhookCallback } from 'grammy';
import { createPrisma, loadEnv } from '@dms/db';
import { getConfig } from '@dms/core/config';
import { startJobRunner } from '@dms/core/jobs';
import { getStorage } from '@dms/core/storage';
import { createBot } from './bot';
import { createTelegramSendHandler } from './jobs';

// Without BOT_TOKEN the bot does not start (D40). BOT_SIMULATOR=1 starts the local driver simulator instead.
async function main(): Promise<void> {
  loadEnv();
  if (process.env.BOT_SIMULATOR === '1') {
    const { startSimulator } = await import('./simulator/server');
    await startSimulator();
    return;
  }
  const cfg = getConfig();
  if (!cfg.BOT_TOKEN) {
    console.log('BOT_TOKEN not set - bot not started (use `pnpm bot:sim` for the local simulator)');
    process.exit(0);
  }
  const token = cfg.BOT_TOKEN;
  const prisma = createPrisma();
  const storage = getStorage();
  const bot = createBot({
    prisma,
    storage,
    token,
    downloadFile: async (fileId) => {
      const f = await bot.api.getFile(fileId);
      if (!f.file_path) throw new Error('telegram returned no file_path');
      const res = await fetch(`https://api.telegram.org/file/bot${token}/${f.file_path}`);
      if (!res.ok) throw new Error(`telegram file download failed: ${res.status}`);
      return { bytes: Buffer.from(await res.arrayBuffer()), fileName: f.file_path.split('/').pop() };
    },
  });
  await bot.init();

  const runner = startJobRunner({
    prisma,
    queues: ['telegram'],
    handlers: { 'telegram.send': createTelegramSendHandler(bot.api) },
  });

  let closeServer: (() => void) | undefined;
  if (cfg.BOT_MODE === 'webhook') {
    if (!cfg.BOT_WEBHOOK_URL) throw new Error('BOT_MODE=webhook requires BOT_WEBHOOK_URL');
    const handle = webhookCallback(bot, 'http', { secretToken: cfg.BOT_WEBHOOK_SECRET });
    const server = createServer((req, res) => {
      if (req.method === 'POST') handle(req, res).catch((e) => console.error('[bot] webhook error', e));
      else {
        res.statusCode = 200;
        res.end('ok');
      }
    });
    await new Promise<void>((r) => server.listen(cfg.BOT_WEBHOOK_PORT, r));
    await bot.api.setWebhook(cfg.BOT_WEBHOOK_URL, { secret_token: cfg.BOT_WEBHOOK_SECRET });
    console.log(`[bot] webhook mode on :${cfg.BOT_WEBHOOK_PORT}`);
    closeServer = () => server.close();
  } else {
    await bot.api.deleteWebhook();
    void bot.start({ onStart: (me) => console.log(`[bot] polling as @${me.username}`) });
  }

  const stop = async () => {
    closeServer?.();
    if (cfg.BOT_MODE !== 'webhook') await bot.stop();
    await runner.stop();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
