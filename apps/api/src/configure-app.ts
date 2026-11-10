import type { INestApplication } from '@nestjs/common';
import helmet from 'helmet';

/** Settings shared by main.ts and the test app. */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api/v1');
  app.use(helmet());
}
