import { Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common';
import type { Observable } from 'rxjs';
import { HTTP_BUCKETS, registry } from '@dms/core/metrics';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const http = context.switchToHttp();
    const req = http.getRequest();
    const res = http.getResponse();
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const route: string = req.route?.path ?? 'unmatched';
      if (route.endsWith('/metrics') || route === 'metrics') return;
      const method: string = req.method;
      registry
        .counter('dms_http_requests_total', 'HTTP requests', ['method', 'route', 'status'])
        .inc({ method, route, status: String(res.statusCode) });
      registry
        .histogram('dms_http_request_duration_seconds', 'HTTP request duration in seconds', HTTP_BUCKETS, ['method', 'route'])
        .observe(Number(process.hrtime.bigint() - start) / 1e9, { method, route });
    });
    return next.handle();
  }
}
