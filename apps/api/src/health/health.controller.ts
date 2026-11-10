import { Controller, Get } from '@nestjs/common';
import { DomainError } from '@dms/core/errors';
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
  metrics() {
    return { uptimeSec: Math.round(process.uptime()), memoryRss: process.memoryUsage().rss };
  }
}
