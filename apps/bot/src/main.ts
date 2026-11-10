import { loadEnv } from '@dms/db';

// WP3 implements the bot. Without BOT_TOKEN the bot does not start (D40).
loadEnv();
if (!process.env.BOT_TOKEN) {
  console.log('BOT_TOKEN not set - bot not started (use `pnpm bot:sim`)');
  process.exit(0);
}
console.log('TODO(WP3): start grammY bot');
