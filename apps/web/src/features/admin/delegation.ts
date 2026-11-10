/** Delegation status computed from its dates and `revokedAt`. REVOKED wins over everything else. */

export type DelegationStatus = 'ACTIVE' | 'UPCOMING' | 'ENDED' | 'REVOKED';

export function delegationStatus(d: { startsAt: string | Date; endsAt: string | Date; revokedAt?: string | Date | null }, now: Date = new Date()): DelegationStatus {
  if (d.revokedAt) return 'REVOKED';
  const t = now.getTime();
  if (t < new Date(d.startsAt).getTime()) return 'UPCOMING';
  if (t >= new Date(d.endsAt).getTime()) return 'ENDED';
  return 'ACTIVE';
}
