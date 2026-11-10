import { Module } from '@nestjs/common';
import { CommonModule } from './common/common.module';
import { ExpenseApiModule } from './expense/expense-api.module';
import { FilesModule } from './files/files.module';
import { HealthModule } from './health/health.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { PlatformModule } from './platform/platform.module';
import { PrismaModule } from './prisma/prisma.module';
import { ReportsModule } from './reports/reports.module';
import { WorkflowApiModule } from './workflow/workflow-api.module';

@Module({
  imports: [
    PrismaModule,
    CommonModule,
    HealthModule,
    PlatformModule,
    ExpenseApiModule,
    WorkflowApiModule,
    IntegrationsModule,
    ReportsModule,
    FilesModule,
  ],
})
export class AppModule {}
