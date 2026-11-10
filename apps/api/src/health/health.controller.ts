import { timingSafeEqual } from 'node:crypto';
import { Controller, Get, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { getConfig } from '@dms/core/config';
import { DomainError } from '@dms/core/errors';
import { collectDbMetrics, collectProcessMetrics, registry } from '@dms/core/metrics';
import { Public } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';

@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get('health')
  health() {
    return { status: 'ok', time: new Date().toISOString() };
  }

  @Public()
  @Get('health/ready')
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new DomainError('CONFLICT', 'Database not ready', 503);
    }
    return { status: 'ready' };
  }

  @Public()
  @Get('metrics')
  async metrics(@Req() req: Request, @Res() res: Response): Promise<void> {
    const cfg = getConfig();
    const token = cfg.METRICS_TOKEN;
    if (token) {
      const given = Buffer.from(String(req.headers.authorization ?? '').replace(/^Bearer /i, ''));
      const want = Buffer.from(token);
      if (given.length !== want.length || !timingSafeEqual(given, want)) {
        throw new DomainError('UNAUTHENTICATED', 'Invalid metrics token');
      }
    } else if (cfg.NODE_ENV === 'production') {
      throw new DomainError('NOT_FOUND', 'Not found');
    }
    collectProcessMetrics();
    await collectDbMetrics(this.prisma);
    res.status(200).type('text/plain; version=0.0.4; charset=utf-8').send(registry.render());
  }
}
