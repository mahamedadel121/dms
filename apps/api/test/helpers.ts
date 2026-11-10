import 'reflect-metadata';
import { randomBytes } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { PrismaClient } from '@dms/db';
import { setupTestDb } from '@dms/db/testing';
import { createLocalStorage, type StorageAdapter } from '@dms/core/storage';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { signAccessToken } from '../src/common/token';
import { PrismaService } from '../src/prisma/prisma.service';

export interface TestApp {
  app: INestApplication;
  http: ReturnType<typeof request>;
  prisma: PrismaClient;
  storage: StorageAdapter;
  /** Creates a Session for the seeded user and returns Bearer headers. */
  auth(username: string): Promise<{ Authorization: string }>;
  close(): Promise<void>;
}

function makeStorage(): StorageAdapter {
  try {
    return createLocalStorage(mkdtempSync(join(tmpdir(), 'dms-test-')));
  } catch {
    // storage lands in WP5; until then any use fails loudly
    return new Proxy({} as StorageAdapter, {
      get: () => () => {
        throw new Error('storage not implemented yet (WP5)');
      },
    });
  }
}

/** Boots the full AppModule against a throwaway DB cloned from dms_template. */
export async function createTestApp(tag: string): Promise<TestApp> {
  const db = await setupTestDb(`api-${tag}`);
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue(db.prisma)
    .compile();
  const app = moduleRef.createNestApplication({ logger: ['error'] });
  configureApp(app);
  await app.init();
  const storage = makeStorage();
  return {
    app,
    http: request(app.getHttpServer()),
    prisma: db.prisma,
    storage,
    async auth(username) {
      const user = await db.prisma.user.findUniqueOrThrow({ where: { username } });
      const session = await db.prisma.session.create({
        data: {
          userId: user.id,
          refreshTokenHash: randomBytes(32).toString('hex'),
          expiresAt: new Date(Date.now() + 86400000),
        },
      });
      return { Authorization: `Bearer ${signAccessToken(user.id, session.id)}` };
    },
    async close() {
      await app.close();
      await db.teardown();
    },
  };
}
