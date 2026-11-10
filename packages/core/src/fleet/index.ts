import type {
  CostCenter,
  DriverVehicleAssignment,
  PrismaClient,
  Vehicle,
  VehicleChangeRequest,
  VehicleType,
} from '@prisma/client';
import type { AuthUser } from '@dms/shared';
import type { Db, Actor } from '../common';
import { DomainError } from '../errors';

// TODO(WP1): implement.
const ni = (n: string): never => {
  throw new DomainError('NOT_IMPLEMENTED', `${n} is not implemented yet (WP1)`);
};

export type AssignmentWithVehicle = DriverVehicleAssignment & {
  vehicle: Vehicle & { costCenter: CostCenter; vehicleType: VehicleType };
};

export async function getCurrentAssignment(_db: Db, _submitterId: string): Promise<AssignmentWithVehicle | null> {
  return ni('getCurrentAssignment');
}
export async function assignVehicle(
  _prisma: PrismaClient,
  _a: {
    submitterId: string;
    vehicleId: string;
    source?: 'MANUAL' | 'CHANGE_REQUEST' | 'IMPORT';
    note?: string;
    vehicleChangeRequestId?: string;
    actor: Actor;
  },
): Promise<DriverVehicleAssignment> {
  return ni('assignVehicle');
}
export async function createVehicleChangeRequest(
  _prisma: PrismaClient,
  _a: { submitterId: string; toVehicleId?: string; requestedVehicleText?: string },
): Promise<VehicleChangeRequest> {
  return ni('createVehicleChangeRequest');
}
export async function decideVehicleChangeRequest(
  _prisma: PrismaClient,
  _a: { id: string; approve: boolean; comment?: string; user: AuthUser; actor: Actor },
): Promise<VehicleChangeRequest> {
  return ni('decideVehicleChangeRequest');
}
export async function checkOdometer(
  _db: Db,
  _vehicleId: string,
  _reading: number,
): Promise<{ last: number | null; warning: 'LOWER_THAN_LAST' | 'UNREALISTIC_JUMP' | null }> {
  return ni('checkOdometer');
}
