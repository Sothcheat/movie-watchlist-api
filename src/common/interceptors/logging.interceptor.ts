import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Observable } from 'rxjs';
import { logRequest, markRequestLogged } from '../request-log.js';
import type { AuthUser } from '../types/auth-user.type.js';

/**
 * Times every request that reaches a route handler. Requests rejected by a guard or matching
 * no route never get here; AllExceptionsFilter logs those.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request & { user?: AuthUser }>();
    const response = http.getResponse<Response>();
    const startedAt = performance.now();

    // Tells the exception filter not to log this request a second time.
    markRequestLogged(response);

    // 'finish' fires after exception filters ran, so the status is the one the client got.
    response.once('finish', () => {
      const ms = Math.round(performance.now() - startedAt);
      logRequest(request, response.statusCode, `${ms}ms`);
    });

    return next.handle();
  }
}
