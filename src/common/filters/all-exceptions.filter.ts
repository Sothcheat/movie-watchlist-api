import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { QueryFailedError } from 'typeorm';
import { logRequest, wasRequestLogged } from '../request-log.js';
import type { AuthUser } from '../types/auth-user.type.js';

const PG_UNIQUE_VIOLATION = '23505';

/**
 * Last line of defence: every error leaves the API as a small JSON body.
 * Stack traces, SQL and driver messages are logged server-side and never sent to the client.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    if (response.headersSent) {
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      this.logIfUnlogged(http.getRequest(), response, status);
      response
        .status(status)
        .json(
          typeof body === 'string'
            ? { statusCode: status, message: body }
            : body,
        );
      return;
    }

    if (
      exception instanceof QueryFailedError &&
      (exception.driverError as { code?: string }).code === PG_UNIQUE_VIOLATION
    ) {
      this.logIfUnlogged(http.getRequest(), response, HttpStatus.CONFLICT);
      response.status(HttpStatus.CONFLICT).json({
        statusCode: HttpStatus.CONFLICT,
        message: 'Resource already exists',
        error: 'Conflict',
      });
      return;
    }

    this.logger.error(
      exception instanceof Error ? exception.message : String(exception),
      exception instanceof Error ? exception.stack : undefined,
    );
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
    });
  }

  /**
   * LoggingInterceptor only runs once a request reaches a route handler. Guard rejections
   * (401/403) and unmatched routes (404) never get there, so log them here instead.
   */
  private logIfUnlogged(
    request: Request & { user?: AuthUser },
    response: Response,
    status: number,
  ): void {
    if (!wasRequestLogged(response)) {
      logRequest(request, status, '(no handler reached)');
    }
  }
}
