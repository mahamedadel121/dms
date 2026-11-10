import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { DomainError } from '@dms/core/errors';
import { assignVehicle, closeAssignment, decideVehicleChangeRequest } from '@dms/core/fleet';
import type { AuthUser } from '@dms/core/rbac';
import {
  assignmentCreateSchema,
  decisionSchema,
  type AssignmentCreateInput,
  type AssignmentRow,
  type CurrentAssignmentsResult,
  type DecisionInput,
  type VehicleChangeRow,
} from '@dms/shared';
import { actorFromReq } from '../common/actor';
import { CurrentUser, RequirePermission } from '../common/decorators';
import { iso } from '../common/paging';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../prisma/prisma.service';

type Req_ = Parameters<typeof actorFromReq>[0];

const aInclude = { submitter: true, vehicle: true } satisfies Prisma.DriverVehicleAssignmentInclude;
const toAssignment = (a: Prisma.DriverVehicleAssignmentGetPayload<{ include: typeof aInclude }>): AssignmentRow => ({
  id: a.id,
  submitterId: a.submitterId,
  submitterName: a.submitter.fullName,
  submitterCode: a.submitter.code,
  vehicleId: a.vehicleId,
  vehicleNumber: a.vehicle.number,
  validFrom: a.validFrom.toISOString(),
  validTo: iso(a.validTo),
  source: a.source,
  note: a.note,
});

@Controller('assignments')
export class AssignmentsController {
  constructor(private readonly prisma: PrismaService) {}

  @RequirePermission('masterdata.view')
  @Get('current')
  async current(): Promise<CurrentAssignmentsResult> {
    const [open, vehicles, drivers] = await Promise.all([
      this.prisma.driverVehicleAssignment.findMany({ where: { validTo: null }, include: aInclude, orderBy: { vehicle: { number: 'asc' } } }),
      this.prisma.vehicle.findMany({ where: { isActive: true }, orderBy: { number: 'asc' } }),
      this.prisma.submitter.findMany({ where: { isActive: true, kind: 'DRIVER' }, orderBy: { code: 'asc' } }),
    ]);
    const assignedVehicles = new Set(open.map((a) => a.vehicleId));
    const assignedDrivers = new Set(open.map((a) => a.submitterId));
    const slim = (v: { id: string; number: string; status: string }) => ({ id: v.id, number: v.number, status: v.status });
    return {
      assignments: open.map(toAssignment),
      unassignedVehicles: vehicles.filter((v) => !assignedVehicles.has(v.id)).map(slim),
      stoppedVehicles: vehicles.filter((v) => v.status !== 'ACTIVE').map(slim),
      driversWithoutVehicle: drivers
        .filter((d) => !assignedDrivers.has(d.id))
        .map((d) => ({ id: d.id, code: d.code, fullName: d.fullName })),
    };
  }

  @RequirePermission('masterdata.view')
  @Get()
  async history(@Query('submitterId') submitterId?: string, @Query('vehicleId') vehicleId?: string): Promise<AssignmentRow[]> {
    const rows = await this.prisma.driverVehicleAssignment.findMany({
      where: { ...(submitterId ? { submitterId } : {}), ...(vehicleId ? { vehicleId } : {}) },
      include: aInclude,
      orderBy: { validFrom: 'desc' },
      take: 1000,
    });
    return rows.map(toAssignment);
  }

  @RequirePermission('assignments.manage')
  @Post()
  async create(@Body(new ZodPipe(assignmentCreateSchema)) b: AssignmentCreateInput, @Req() req: Req_): Promise<AssignmentRow> {
    const a = await assignVehicle(this.prisma, {
      submitterId: b.submitterId,
      vehicleId: b.vehicleId,
      note: b.note ?? undefined,
      source: 'MANUAL',
      actor: actorFromReq(req),
    });
    const full = await this.prisma.driverVehicleAssignment.findUniqueOrThrow({ where: { id: a.id }, include: aInclude });
    return toAssignment(full);
  }

  @RequirePermission('assignments.manage')
  @Post(':id/close')
  @HttpCode(200)
  async close(@Param('id') id: string, @Req() req: Req_): Promise<AssignmentRow> {
    const a = await closeAssignment(this.prisma, { assignmentId: id, actor: actorFromReq(req) });
    return toAssignment(await this.prisma.driverVehicleAssignment.findUniqueOrThrow({ where: { id: a.id }, include: aInclude }));
  }
}

const decideSchema = decisionSchema;
type DecideInput = DecisionInput;

const vInclude = { submitter: true, fromVehicle: true, toVehicle: true, decidedBy: true } satisfies Prisma.VehicleChangeRequestInclude;
const toVcr = (v: Prisma.VehicleChangeRequestGetPayload<{ include: typeof vInclude }>): VehicleChangeRow => ({
  id: v.id,
  submitterId: v.submitterId,
  submitterName: v.submitter.fullName,
  fromVehicleId: v.fromVehicleId,
  fromVehicleNumber: v.fromVehicle?.number ?? null,
  toVehicleId: v.toVehicleId,
  toVehicleNumber: v.toVehicle?.number ?? null,
  requestedVehicleText: v.requestedVehicleText,
  status: v.status,
  decidedByName: v.decidedBy?.fullName ?? null,
  decidedAt: iso(v.decidedAt),
  decisionComment: v.decisionComment,
  createdAt: v.createdAt.toISOString(),
});

@Controller('vehicle-change-requests')
export class VehicleChangesController {
  constructor(private readonly prisma: PrismaService) {}

  @RequirePermission('vehicle_changes.view')
  @Get()
  async list(@Query('status') status?: string): Promise<VehicleChangeRow[]> {
    const ok = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'];
    if (status && !ok.includes(status)) throw new DomainError('VALIDATION', 'Invalid status');
    const rows = await this.prisma.vehicleChangeRequest.findMany({
      where: status ? { status: status as never } : {},
      include: vInclude,
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    return rows.map(toVcr);
  }

  private async decide(id: string, approve: boolean, b: DecideInput, u: AuthUser, req: Req_): Promise<VehicleChangeRow> {
    await decideVehicleChangeRequest(this.prisma, {
      id,
      approve,
      comment: b.comment ?? undefined,
      toVehicleId: b.toVehicleId,
      user: u,
      actor: actorFromReq(req),
    });
    return toVcr(await this.prisma.vehicleChangeRequest.findUniqueOrThrow({ where: { id }, include: vInclude }));
  }

  @RequirePermission('vehicle_changes.decide')
  @Post(':id/approve')
  @HttpCode(200)
  approve(@Param('id') id: string, @Body(new ZodPipe(decideSchema)) b: DecideInput, @CurrentUser() u: AuthUser, @Req() req: Req_) {
    return this.decide(id, true, b, u, req);
  }

  @RequirePermission('vehicle_changes.decide')
  @Post(':id/reject')
  @HttpCode(200)
  reject(@Param('id') id: string, @Body(new ZodPipe(decideSchema)) b: DecideInput, @CurrentUser() u: AuthUser, @Req() req: Req_) {
    return this.decide(id, false, b, u, req);
  }
}
