import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { PrismaClient } from '@prisma/client';
import { adminUrl, pgUrl } from './pgconfig';

export interface TestDb {
  url: string;
  prisma: PrismaClient;
  teardown(): Promise<void>;
}

/** Clones `dms_template` into a throwaway database for one test file. Never touches `dms`. */
export async function setupTestDb(tag: string): Promise<TestDb> {
  const safeTag = tag.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 30);
  const name = `dms_t_${safeTag}_${randomBytes(4).toString('hex')}`;
  let lastErr: unknown;
  for (let i = 0; i < 3; i++) {
    const admin = new pg.Client({ connectionString: adminUrl() });
    await admin.connect();
    try {
      await admin.query(`CREATE DATABASE "${name}" TEMPLATE dms_template`);
      lastErr = undefined;
      break;
    } catch (e) {
      lastErr = e; // template briefly in use by another clone: retry
      await new Promise((r) => setTimeout(r, 300 * (i + 1)));
    } finally {
      await admin.end();
    }
  }
  if (lastErr) throw lastErr;

  const u = pgUrl();
  u.pathname = `/${name}`;
  const url = u.toString();
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  await prisma.$connect();
  return {
    url,
    prisma,
    async teardown() {
      await prisma.$disconnect();
      const admin = new pg.Client({ connectionString: adminUrl() });
      await admin.connect();
      try {
        await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      } finally {
        await admin.end();
      }
    },
  };
}
