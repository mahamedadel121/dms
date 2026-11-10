import { Module } from '@nestjs/common';
import { DocumentsController } from './documents.controller';
import { SapController } from './sap.controller';

// Owned by WP4: documents / PDF, template preview, SAP monitor + retry.
@Module({ controllers: [DocumentsController, SapController] })
export class IntegrationsModule {}
