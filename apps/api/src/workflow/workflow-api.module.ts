import { Module, type OnModuleInit } from '@nestjs/common';
import { registerExpenseModule } from '@dms/core/expense';
import { RequestTypesController, TemplatesController, WorkflowsController } from './config.controller';
import { RequestsController } from './requests.controller';

// Owned by WP2.
@Module({
  controllers: [RequestsController, RequestTypesController, WorkflowsController, TemplatesController],
})
export class WorkflowApiModule implements OnModuleInit {
  onModuleInit(): void {
    registerExpenseModule(); // idempotent; modules plug into the engine by RequestType.moduleKey
  }
}
