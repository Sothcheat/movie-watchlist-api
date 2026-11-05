import { Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { AuthUser } from './types/auth-user.type.js';

/** `res.locals` key set once a request has been (or will be) logged by LoggingInterceptor. */
export const REQUEST_LOGGED = 'requestLogged';

const logger = new Logger('HTTP');

/**
 * One log line per request. Method, path (no query string), status and user id only;
 * never bodies, headers, cookies or tokens. 4xx are warnings so repeated 401/403
 * show up (OWASP A09); 5xx are errors.
 */
export function logRequest(
  request: Request & { user?: AuthUser },
  status: number,
  detail: string,
): void {
  const line = `${request.method} ${request.path} ${status} ${detail} user=${request.user?.id ?? 'anonymous'}`;

  if (status >= 500) {
    logger.error(line);
  } else if (status >= 400) {
    logger.warn(line);
  } else {
    logger.log(line);
  }
}

export function markRequestLogged(response: Response): void {
  response.locals[REQUEST_LOGGED] = true;
}

export function wasRequestLogged(response: Response): boolean {
  return response.locals[REQUEST_LOGGED] === true;
}
