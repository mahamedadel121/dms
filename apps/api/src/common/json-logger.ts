import type { LoggerService } from '@nestjs/common';
import pino from 'pino';

/** Nest LoggerService writing JSON lines through pino. */
export function createJsonLogger(level = process.env.LOG_LEVEL || 'info'): LoggerService {
  const p = pino({ level });
  const msg = (m: unknown) => (typeof m === 'string' ? m : JSON.stringify(m));
  return {
    log: (m, ctx) => p.info({ ctx }, msg(m)),
    error: (m, ...rest) => p.error({ ctx: rest[rest.length - 1] }, msg(m)),
    warn: (m, ctx) => p.warn({ ctx }, msg(m)),
    debug: (m, ctx) => p.debug({ ctx }, msg(m)),
    verbose: (m, ctx) => p.trace({ ctx }, msg(m)),
  };
}
