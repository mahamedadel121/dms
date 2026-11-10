import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { HealthController } from './health.controller';
import { MetricsInterceptor } from './metrics.interceptor';

@Module({
  controllers: [HealthController],
  providers: [{ provide: APP_INTERCEPTOR, useClass: MetricsInterceptor }],
})
export class HealthModule {}
