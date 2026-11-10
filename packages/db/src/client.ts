import { PrismaClient } from '@prisma/client';
import { loadEnv } from './env';

export function createPrisma(url?: string): PrismaClient {
  loadEnv();
  return new PrismaClient(url ? { datasources: { db: { url } } } : undefined);
}

const g = globalThis as unknown as { __dmsPrisma?: PrismaClient };
/** Process-wide singleton bound to DATABASE_URL. */
export function getPrisma(): PrismaClient {
  return (g.__dmsPrisma ??= createPrisma());
}
