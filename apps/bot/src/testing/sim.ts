// `pnpm bot:sim` / `pnpm --filter @dms/bot sim`: local driver simulator (web chat page) on 127.0.0.1:3010.
process.env.BOT_SIMULATOR = '1';
import('../simulator/server')
  .then(({ startSimulator }) => startSimulator())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
