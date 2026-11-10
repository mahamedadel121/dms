import { Catch, HttpException, Logger, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import { isDomainError } from '@dms/core/errors';

const HTTP_CODES: Record<number, string> = {
  400: 'VALIDATION',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'VALIDATION',
  501: 'NOT_IMPLEMENTED',
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly log = new Logger('Errors');

  catch(e: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse();
    if (isDomainError(e)) {
      res.status(e.httpStatus).json({ error: { code: e.code, message: e.message, details: e.details } });
      return;
    }
    if (e instanceof HttpException) {
      const status = e.getStatus();
      const body = e.getResponse();
      const message = typeof body === 'string' ? body : ((body as { message?: unknown }).message ?? e.message);
      res.status(status).json({
        error: {
          code: HTTP_CODES[status] ?? 'ERROR',
          message: Array.isArray(message) ? message.join('; ') : String(message),
        },
      });
      return;
    }
    this.log.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
    res.status(500).json({ error: { code: 'INTERNAL', message: 'Internal server error' } });
  }
}
