import type { PrismaClient, Job } from '@prisma/client';
import { DomainError } from '../errors';

export { enqueueJob } from './enqueue';
export type { EnqueueInput } from './enqueue';

export type JobHandler = (job: Job, ctx: { prisma: PrismaClient }) => Promise<unknown>;

// TODO(WP4): runner implementation (SKIP LOCKED claim, backoff, stale-lock recovery).
export function startJobRunner(_o: {
  prisma: PrismaClient;
  queues: string[];
  handlers: Record<string, JobHandler>;
  workerId?: string;
  pollMs?: number;
  concurrency?: number;
}): { stop(): Promise<void> } {
  throw new DomainError('NOT_IMPLEMENTED', 'startJobRunner is not implemented yet (WP4)');
}

/** Drains due jobs once; returns the number processed. */
export async function runDueJobs(_o: {
  prisma: PrismaClient;
  queues: string[];
  handlers: Record<string, JobHandler>;
}): Promise<number> {
  throw new DomainError('NOT_IMPLEMENTED', 'runDueJobs is not implemented yet (WP4)');
}
