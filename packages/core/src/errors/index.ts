import { ERROR_HTTP_STATUS, type ErrorCode } from '@dms/shared';

export type { ErrorCode };
export type { Db, Actor } from '../common';

export class DomainError extends Error {
  readonly code: ErrorCode;
  readonly httpStatus: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, httpStatus?: number, details?: unknown) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.httpStatus = httpStatus ?? ERROR_HTTP_STATUS[code];
    this.details = details;
  }

  toJSON() {
    return { error: { code: this.code, message: this.message, details: this.details } };
  }
}

export function isDomainError(e: unknown): e is DomainError {
  return e instanceof DomainError;
}

export function notImplemented(what: string): never {
  throw new DomainError('NOT_IMPLEMENTED', `${what} is not implemented yet`);
}
