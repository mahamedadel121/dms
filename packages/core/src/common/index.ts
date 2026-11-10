import type { Prisma, PrismaClient } from '@prisma/client';

/** PrismaClient or an interactive-transaction client. */
export type Db = PrismaClient | Prisma.TransactionClient;

export interface Actor {
  type: 'USER' | 'SUBMITTER' | 'SYSTEM';
  userId?: string;
  submitterId?: string;
  label?: string;
  ip?: string;
  userAgent?: string;
}

export const SYSTEM_ACTOR: Actor = { type: 'SYSTEM', label: 'system' };
