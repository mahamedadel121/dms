import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AssignmentsController, VehicleChangesController } from './fleet.controller';
import { DelegationsController } from './delegations.controller';
import { MASTER_CONTROLLERS, SubmitterExtrasController } from './master.controller';
import { MasterService } from './master.service';
import { AuditController, LookupsController, NotificationsController, SettingsController } from './misc.controller';
import { RolesController } from './roles.controller';
import { SignaturesController } from './signatures.controller';
import { UsersController } from './users.controller';

// Owned by WP1.
@Module({
  controllers: [
    AuthController,
    UsersController,
    RolesController,
    DelegationsController,
    AuditController,
    SettingsController,
    NotificationsController,
    LookupsController,
    SignaturesController,
    SubmitterExtrasController,
    AssignmentsController,
    VehicleChangesController,
    ...MASTER_CONTROLLERS,
  ],
  providers: [AuthService, MasterService],
})
export class PlatformModule {}
