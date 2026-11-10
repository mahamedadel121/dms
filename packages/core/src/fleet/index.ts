import type {
  CostCenter,
  DriverVehicleAssignment,
  Prisma,
  PrismaClient,
  Vehicle,
  VehicleChangeRequest,
  VehicleType,
} from '@prisma/client';
import { hasPermission, type AuthUser } from '../rbac';
import type { Db, Actor } from '../common';
import { audit } from '../audit';
import { getSetting } from '../config';
import { DomainError } from '../errors';
import { notifyRole, notifySubmitter } from '../notifications';

export type AssignmentWithVehicle = DriverVehicleAssignment & {
  vehicle: Vehicle & { costCenter: CostCenter; vehicleType: VehicleType };
};

export async function getCurrentAssignment(db: Db, submitterId: string): Promise<AssignmentWithVehicle | null> {
  return db.driverVehicleAssignment.findFirst({
    where: { submitterId, validTo: null },
    include: { vehicle: { include: { costCenter: true, vehicleType: true } } },
    orderBy: { validFrom: 'desc' },
  });
}

export interface AssignVehicleArgs {
  submitterId: string;
  vehicleId: string;
  source?: 'MANUAL' | 'CHANGE_REQUEST' | 'IMPORT';
  note?: string;
  vehicleChangeRequestId?: string;
  actor: Actor;
}

/** Closes the driver's open row and opens a new one. Must run inside a transaction. */
export async function assignVehicleTx(tx: Prisma.TransactionClient, a: AssignVehicleArgs): Promise<DriverVehicleAssignment> {
  // serialise concurrent changes of the same driver
  await tx.$queryRaw`SELECT id FROM submitters WHERE id = ${a.submitterId} FOR UPDATE`;
  const submitter = await tx.submitter.findUnique({ where: { id: a.submitterId } });
  if (!submitter) throw new DomainError('NOT_FOUND', 'Driver not found');
  const vehicle = await tx.vehicle.findUnique({ where: { id: a.vehicleId } });
  if (!vehicle) throw new DomainError('NOT_FOUND', 'Vehicle not found');
  if (!vehicle.isActive) throw new DomainError('INVALID_STATE', 'Vehicle is inactive');

  const open = await tx.driverVehicleAssignment.findFirst({ where: { submitterId: a.submitterId, validTo: null } });
  if (open && open.vehicleId === a.vehicleId) return open; // already assigned: idempotent
  const now = new Date();
  if (open) {
    await tx.driverVehicleAssignment.update({
      where: { id: open.id },
      data: { validTo: now, closedById: a.actor.userId ?? null },
    });
  }
  const created = await tx.driverVehicleAssignment.create({
    data: {
      submitterId: a.submitterId,
      vehicleId: a.vehicleId,
      validFrom: now,
      source: a.source ?? 'MANUAL',
      note: a.note ?? null,
      vehicleChangeRequestId: a.vehicleChangeRequestId ?? null,
      createdById: a.actor.userId ?? null,
    },
  });
  await audit(tx, {
    actor: a.actor,
    action: 'assignment.change',
    entityType: 'DriverVehicleAssignment',
    entityId: created.id,
    before: open ? { id: open.id, vehicleId: open.vehicleId } : null,
    after: { id: created.id, submitterId: a.submitterId, vehicleId: a.vehicleId, source: created.source },
  });
  return created;
}

export async function assignVehicle(prisma: PrismaClient, a: AssignVehicleArgs): Promise<DriverVehicleAssignment> {
  return prisma.$transaction((tx) => assignVehicleTx(tx, a), { timeout: 15000 });
}

/** Closes the driver's open assignment without opening a new one. */
export async function closeAssignment(
  prisma: PrismaClient,
  a: { assignmentId: string; actor: Actor },
): Promise<DriverVehicleAssignment> {
  return prisma.$transaction(async (tx) => {
    const row = await tx.driverVehicleAssignment.findUnique({ where: { id: a.assignmentId } });
    if (!row) throw new DomainError('NOT_FOUND', 'Assignment not found');
    if (row.validTo) throw new DomainError('INVALID_STATE', 'Assignment already closed');
    const upd = await tx.driverVehicleAssignment.update({
      where: { id: row.id },
      data: { validTo: new Date(), closedById: a.actor.userId ?? null },
    });
    await audit(tx, {
      actor: a.actor,
      action: 'assignment.close',
      entityType: 'DriverVehicleAssignment',
      entityId: row.id,
      before: { vehicleId: row.vehicleId, validTo: null },
      after: { validTo: upd.validTo },
    });
    return upd;
  });
}

export async function createVehicleChangeRequest(
  prisma: PrismaClient,
  a: { submitterId: string; toVehicleId?: string; requestedVehicleText?: string },
): Promise<VehicleChangeRequest> {
  const roleCode = await getSetting(prisma, 'expense.vehicleChangeRoleCode');
  const role = await prisma.role.findUnique({ where: { code: roleCode } });
  const { vcr, created } = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM submitters WHERE id = ${a.submitterId} FOR UPDATE`;
    const submitter = await tx.submitter.findUnique({ where: { id: a.submitterId } });
    if (!submitter) throw new DomainError('NOT_FOUND', 'Driver not found');
    const pending = await tx.vehicleChangeRequest.findFirst({ where: { submitterId: a.submitterId, status: 'PENDING' } });
    if (pending) return { vcr: pending, created: false };
    if (a.toVehicleId) {
      const v = await tx.vehicle.findUnique({ where: { id: a.toVehicleId } });
      if (!v) throw new DomainError('NOT_FOUND', 'Vehicle not found');
    }
    const current = await getCurrentAssignment(tx, a.submitterId);
    const row = await tx.vehicleChangeRequest.create({
      data: {
        submitterId: a.submitterId,
        fromVehicleId: current?.vehicleId ?? null,
        toVehicleId: a.toVehicleId ?? null,
        requestedVehicleText: a.requestedVehicleText ?? null,
        assignedRoleId: role?.id ?? null,
      },
    });
    await audit(tx, {
      actor: { type: 'SUBMITTER', submitterId: a.submitterId, label: submitter.fullName },
      action: 'vehicle_change.create',
      entityType: 'VehicleChangeRequest',
      entityId: row.id,
      after: { toVehicleId: row.toVehicleId, requestedVehicleText: row.requestedVehicleText },
    });
    return { vcr: row, created: true };
  });
  if (created && role) {
    try {
      const submitter = await prisma.submitter.findUnique({ where: { id: a.submitterId } });
      const text = a.requestedVehicleText ?? a.toVehicleId ?? '';
      await notifyRole(prisma, {
        roleId: role.id,
        type: 'VEHICLE_CHANGE_REQUESTED',
        titleAr: 'طلب تغيير سيارة',
        titleEn: 'Vehicle change request',
        bodyAr: `السائق ${submitter?.fullName ?? ''} يطلب التحويل إلى السيارة ${text}`,
        bodyEn: `${submitter?.fullName ?? 'A driver'} requests vehicle ${text}`,
        data: { vehicleChangeRequestId: vcr.id },
      });
    } catch {
      // notifications are best-effort (WP2); the request itself is committed
    }
  }
  return vcr;
}

export async function decideVehicleChangeRequest(
  prisma: PrismaClient,
  a: {
    id: string;
    approve: boolean;
    comment?: string;
    /** Approver may resolve an unmatched typed vehicle by picking the real one. */
    toVehicleId?: string;
    user: AuthUser;
    actor: Actor;
  },
): Promise<VehicleChangeRequest> {
  if (!hasPermission(a.user, 'vehicle_changes.decide')) {
    throw new DomainError('FORBIDDEN', 'Missing permission');
  }
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM vehicle_change_requests WHERE id = ${a.id} FOR UPDATE`;
    const vcr = await tx.vehicleChangeRequest.findUnique({ where: { id: a.id } });
    if (!vcr) throw new DomainError('NOT_FOUND', 'Vehicle change request not found');
    if (vcr.status !== 'PENDING') throw new DomainError('INVALID_STATE', `Request already ${vcr.status}`);
    const toVehicleId = a.toVehicleId ?? vcr.toVehicleId;
    if (a.approve && !toVehicleId) {
      throw new DomainError('VALIDATION', 'Select the target vehicle before approving');
    }
    const upd = await tx.vehicleChangeRequest.update({
      where: { id: vcr.id },
      data: {
        status: a.approve ? 'APPROVED' : 'REJECTED',
        toVehicleId: a.approve ? toVehicleId : vcr.toVehicleId,
        decidedById: a.user.id,
        decidedAt: new Date(),
        decisionComment: a.comment ?? null,
      },
    });
    if (a.approve) {
      await assignVehicleTx(tx, {
        submitterId: vcr.submitterId,
        vehicleId: toVehicleId!,
        source: 'CHANGE_REQUEST',
        vehicleChangeRequestId: vcr.id,
        note: a.comment,
        actor: a.actor,
      });
    }
    await audit(tx, {
      actor: a.actor,
      action: a.approve ? 'vehicle_change.approve' : 'vehicle_change.reject',
      entityType: 'VehicleChangeRequest',
      entityId: vcr.id,
      before: { status: vcr.status, toVehicleId: vcr.toVehicleId },
      after: { status: upd.status, toVehicleId: upd.toVehicleId, comment: a.comment ?? null },
    });
    return upd;
  });
  try {
    await notifySubmitter(prisma, {
      submitterId: result.submitterId,
      type: a.approve ? 'VEHICLE_CHANGE_APPROVED' : 'VEHICLE_CHANGE_REJECTED',
      bodyAr: a.approve ? 'تمت الموافقة على تغيير السيارة' : 'تم رفض طلب تغيير السيارة',
      data: { vehicleChangeRequestId: result.id },
    });
  } catch {
    // best-effort (WP2)
  }
  return result;
}

export async function checkOdometer(
  db: Db,
  vehicleId: string,
  reading: number,
): Promise<{ last: number | null; warning: 'LOWER_THAN_LAST' | 'UNREALISTIC_JUMP' | null }> {
  const v = await db.vehicle.findUnique({ where: { id: vehicleId }, select: { lastOdometer: true } });
  const last = v?.lastOdometer ?? null;
  if (last === null) return { last, warning: null };
  if (reading < last) return { last, warning: 'LOWER_THAN_LAST' };
  const maxJump = await getSetting(db, 'expense.odometerMaxJumpKm');
  if (reading - last > maxJump) return { last, warning: 'UNREALISTIC_JUMP' };
  return { last, warning: null };
}
