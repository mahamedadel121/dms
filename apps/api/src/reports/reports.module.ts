import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';

// Owned by WP5.
@Module({ controllers: [ReportsController] })
export class ReportsModule {}
