import { loadEnv, createPrisma } from '@dms/db';
import { getConfig } from '@dms/core/config';
import { startJobRunner } from '@dms/core/jobs';
import { closePdfBrowser } from '@dms/core/pdf';
import { createHandlers, SCHEDULES } from './handlers';

async function main(): Promise<void> {
  loadEnv();
  const cfg = getConfig();
  const prisma = createPrisma();
  await prisma.$connect();
  const runner = startJobRunner({
    prisma,
    queues: ['default'],
    handlers: createHandlers(),
    concurrency: cfg.WORKER_CONCURRENCY,
    schedules: SCHEDULES,
    scheduleEveryMs: 60_000,
  });
  console.log(JSON.stringify({ level: 'info', msg: 'worker started', concurrency: cfg.WORKER_CONCURRENCY }));

  let stopping = false;
  const shutdown = async (sig: string) => {
    if (stopping) return;
    stopping = true;
    console.log(JSON.stringify({ level: 'info', msg: 'worker stopping', sig }));
    await runner.stop();
    await closePdfBrowser();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
