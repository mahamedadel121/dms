import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import { DomainError } from '@dms/core/errors';
import { hasPermission, type AuthUser } from '@dms/core/rbac';
import {
  createExport,
  dashboardSummary,
  exportInfo,
  listDelayed,
  queryReport,
  type ReportFilters,
} from '@dms/core/reports';
import {
  createExportSchema,
  dashboardQuerySchema,
  reportQuerySchema,
  type CreateExportDto,
  type DashboardQueryDto,
  type ReportQueryDto,
} from '@dms/shared';
import { actorFromReq } from '../common/actor';
import { CurrentUser, RequirePermission } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../prisma/prisma.service';

@Controller()
export class ReportsController {
  constructor(private readonly prisma: PrismaService) {}

  @RequirePermission('reports.view')
  @HttpCode(200)
  @Post('reports/query')
  query(@Body(new ZodPipe(reportQuerySchema)) b: ReportQueryDto) {
    return queryReport(this.prisma, b.filters as ReportFilters, { groupBy: b.groupBy, page: b.page, pageSize: b.pageSize });
  }

  @RequirePermission('reports.export')
  @Post('reports/exports')
  async createExport(
    @Body(new ZodPipe(createExportSchema)) b: CreateExportDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Parameters<typeof actorFromReq>[0],
  ) {
    if (b.kind === 'ZIP_IMAGES' && !hasPermission(user, 'reports.export_images')) {
      throw new DomainError('FORBIDDEN', 'Missing permission: reports.export_images');
    }
    return createExport(this.prisma, {
      userId: user.id,
      kind: b.kind,
      filters: b.filters as ReportFilters,
      groupBy: b.groupBy,
      options: b.options,
      actor: actorFromReq(req),
    });
  }

  @RequirePermission('reports.view', 'reports.export')
  @Get('reports/exports')
  async myExports(@CurrentUser() user: AuthUser) {
    const rows = await this.prisma.reportExport.findMany({
      where: { requestedById: user.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map(exportInfo);
  }

  @RequirePermission('reports.view', 'reports.export')
  @Get('reports/exports/:id')
  async getExport(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    const row = await this.prisma.reportExport.findUnique({ where: { id } });
    // other users' exports are indistinguishable from missing ones
    if (!row || row.requestedById !== user.id) throw new DomainError('NOT_FOUND', 'Export not found');
    return exportInfo(row);
  }

  @RequirePermission('dashboard.view')
  @Get('dashboard/summary')
  summary(@Query(new ZodPipe(dashboardQuerySchema)) q: DashboardQueryDto) {
    return dashboardSummary(this.prisma, q);
  }

  @RequirePermission('dashboard.view')
  @Get('dashboard/delayed')
  delayed() {
    return listDelayed(this.prisma);
  }
}
