import { randomUUID } from 'node:crypto';
import type { Job, PrismaClient } from '@prisma/client';
import { enqueueJob } from './enqueue';

export type JobHandler = (job: Job, ctx: { prisma: PrismaClient }) => Promise<unknown>;

export interface RunnerOptions {
  prisma: PrismaClient;
  queues: string[];
  handlers: Record<string, JobHandler>;
  workerId?: string;
}

const STALE_LOCK_MS = 10 * 60_000;

/** 30s * 2^(attempts-1), capped at 1h, +-20% jitter. `attempts` is the number of attempts already made (>= 1). */
export function computeBackoffMs(attempts: number, rnd: () => number = Math.random): number {
  const base = Math.min(30_000 * 2 ** Math.max(0, attempts - 1), 3_600_000);
  return Math.round(base * (0.8 + rnd() * 0.4));
}

/** Claims one due job (FOR UPDATE SKIP LOCKED). Returns null when nothing is due. */
export async function claimJob(prisma: PrismaClient, queues: string[], workerId: string): Promise<Job | null> {
  const rows = await prisma.$queryRaw<Job[]>`
    UPDATE jobs SET status='RUNNING', "lockedAt"=now(), "lockedBy"=${workerId}, attempts=attempts+1, "updatedAt"=now()
    WHERE id = (SELECT id FROM jobs WHERE queue = ANY(${queues}::text[]) AND status='PENDING' AND "runAt" <= now()
                ORDER BY priority DESC, "runAt" FOR UPDATE SKIP LOCKED LIMIT 1)
    RETURNING *`;
  return rows[0] ?? null;
}

function errMessage(e: unknown): string {
  const m = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  return m.slice(0, 2000);
}

/** Runs the handler of a claimed job and records the outcome. Never throws. */
export async function executeJob(
  prisma: PrismaClient,
  job: Job,
  handlers: Record<string, JobHandler>,
): Promise<'DONE' | 'RETRY' | 'FAILED'> {
  const handler = handlers[job.type];
  try {
    if (!handler) throw Object.assign(new Error(`No handler for job type ${job.type}`), { fatal: true });
    const result = await handler(job, { prisma });
    await prisma.job.update({
      where: { id: job.id },
      data: {
        status: 'DONE',
        finishedAt: new Date(),
        lockedAt: null,
        lockedBy: null,
        lastError: null,
        result: (result === undefined ? undefined : (JSON.parse(JSON.stringify(result)) ?? undefined)) as never,
      },
    });
    return 'DONE';
  } catch (e) {
    const fatal = (e as { fatal?: boolean })?.fatal === true;
    const exhausted = fatal || job.attempts >= job.maxAttempts;
    await prisma.job.update({
      where: { id: job.id },
      data: exhausted
        ? { status: 'FAILED', finishedAt: new Date(), lockedAt: null, lockedBy: null, lastError: errMessage(e) }
        : {
            status: 'PENDING',
            runAt: new Date(Date.now() + computeBackoffMs(job.attempts)),
            lockedAt: null,
            lockedBy: null,
            lastError: errMessage(e),
          },
    });
    return exhausted ? 'FAILED' : 'RETRY';
  }
}

/** RUNNING rows locked for longer than `olderThanMs` (default 10 min) go back to PENDING. */
export async function recoverStaleJobs(prisma: PrismaClient, olderThanMs = STALE_LOCK_MS): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMs);
  const r = await prisma.job.updateMany({
    where: { status: 'RUNNING', lockedAt: { lt: cutoff } },
    data: { status: 'PENDING', lockedAt: null, lockedBy: null, lastError: 'recovered: stale lock' },
  });
  return r.count;
}

/** Drains due jobs once; returns the number processed. */
export async function runDueJobs(o: RunnerOptions & { max?: number }): Promise<number> {
  const workerId = o.workerId ?? `run-${randomUUID().slice(0, 8)}`;
  let n = 0;
  const max = o.max ?? 10_000;
  while (n < max) {
    const job = await claimJob(o.prisma, o.queues, workerId);
    if (!job) break;
    await executeJob(o.prisma, job, o.handlers);
    n++;
  }
  return n;
}

export interface JobSchedule {
  type: string;
  everySec: number;
  queue?: 'default' | 'telegram';
  payload?: object;
}

/** Inserts the current time-bucket job of each schedule; dedupeKey makes it safe with several workers. */
export async function ensureScheduledJobs(prisma: PrismaClient, schedules: JobSchedule[], now = new Date()): Promise<number> {
  let created = 0;
  for (const s of schedules) {
    const bucket = Math.floor(now.getTime() / 1000 / s.everySec);
    const r = await enqueueJob(prisma, {
      type: s.type,
      queue: s.queue,
      payload: s.payload,
      dedupeKey: `${s.type}:${bucket}`,
      maxAttempts: 3,
    });
    if (r.created) created++;
  }
  return created;
}

export function startJobRunner(o: {
  prisma: PrismaClient;
  queues: string[];
  handlers: Record<string, JobHandler>;
  workerId?: string;
  pollMs?: number;
  concurrency?: number;
  staleCheckMs?: number;
  schedules?: JobSchedule[];
  scheduleEveryMs?: number;
  onError?: (e: unknown) => void;
}): { stop(): Promise<void> } {
  const workerId = o.workerId ?? `w-${process.pid}-${randomUUID().slice(0, 6)}`;
  const pollMs = o.pollMs ?? 1000;
  const concurrency = Math.max(1, o.concurrency ?? 1);
  let stopped = false;
  const wakeups: (() => void)[] = [];
  const sleep = (ms: number) =>
    new Promise<void>((res) => {
      const t = setTimeout(res, ms);
      wakeups.push(() => {
        clearTimeout(t);
        res();
      });
    });
  const report = (e: unknown) => (o.onError ? o.onError(e) : console.error('[jobs]', e));

  const loops = Array.from({ length: concurrency }, async (_, i) => {
    while (!stopped) {
      try {
        const job = await claimJob(o.prisma, o.queues, `${workerId}#${i}`);
        if (job) {
          await executeJob(o.prisma, job, o.handlers);
          continue; // immediately look for more
        }
      } catch (e) {
        report(e);
      }
      await sleep(pollMs);
    }
  });

  const timers: NodeJS.Timeout[] = [];
  const maintenance = async () => {
    try {
      await recoverStaleJobs(o.prisma);
      if (o.schedules?.length) await ensureScheduledJobs(o.prisma, o.schedules);
    } catch (e) {
      report(e);
    }
  };
  void maintenance();
  timers.push(setInterval(maintenance, o.scheduleEveryMs ?? o.staleCheckMs ?? 60_000));

  return {
    async stop() {
      stopped = true;
      timers.forEach(clearInterval);
      wakeups.splice(0).forEach((w) => w());
      await Promise.all(loops);
    },
  };
}
