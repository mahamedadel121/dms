import { Module } from '@nestjs/common';
import { FilesController } from './files.controller';

// Owned by WP5.
@Module({ controllers: [FilesController] })
export class FilesModule {}
