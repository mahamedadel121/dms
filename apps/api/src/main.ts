import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { loadEnv } from '@dms/db';
import { getConfig } from '@dms/core/config';
import { AppModule } from './app.module';
import { configureApp } from './configure-app';
import { createJsonLogger } from './common/json-logger';

async function bootstrap(): Promise<void> {
  loadEnv();
  const cfg = getConfig();
  const app = await NestFactory.create(AppModule, { logger: createJsonLogger(cfg.LOG_LEVEL) });
  configureApp(app);
  app.enableShutdownHooks();
  await app.listen(cfg.API_PORT);
}

bootstrap().catch((e) => {
  console.error(e);
  process.exit(1);
});
