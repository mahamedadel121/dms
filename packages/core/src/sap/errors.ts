import { DomainError } from '../errors';

/** SAP answered and refused the document: it was definitely NOT posted. */
export class SapRejectedError extends DomainError {
  readonly definiteFailure = true;
  constructor(message: string) {
    super('INVALID_STATE', message);
  }
}

/** We cannot find out whether an earlier attempt was posted. `permanent` = configuration (lookup mode none), not a transient outage. */
export class SapLookupUnavailableError extends DomainError {
  constructor(
    message: string,
    readonly permanent = false,
  ) {
    super('INVALID_STATE', `UNKNOWN_OUTCOME: ${message}`);
  }
}

export const isDefiniteFailure = (e: unknown): boolean => e instanceof SapRejectedError;
