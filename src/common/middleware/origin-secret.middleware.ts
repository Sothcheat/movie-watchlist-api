import { HttpStatus } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { logRequest } from '../request-log.js';
import type { AuthUser } from '../types/auth-user.type.js';

export const ORIGIN_SECRET_HEADER = 'x-origin-secret';
/** Render calls this directly, without the Vercel proxy, so it can't carry the secret. */
export const HEALTH_PATH = '/api/health';

const digest = (value: string) => createHash('sha256').update(value).digest();

/**
 * Refuses every request that didn't come through the Vercel proxy, which adds the shared
 * secret as a header. Digests are compared so the check takes the same time whatever the
 * length of the header.
 */
export function originSecretMiddleware(secret: string) {
  const expected = digest(secret);

  return (
    req: Request & { user?: AuthUser },
    res: Response,
    next: NextFunction,
  ) => {
    if (req.method === 'GET' && req.path === HEALTH_PATH) {
      next();
      return;
    }

    const given = req.headers[ORIGIN_SECRET_HEADER];
    if (typeof given === 'string' && timingSafeEqual(digest(given), expected)) {
      next();
      return;
    }

    logRequest(req, HttpStatus.FORBIDDEN, 'origin secret missing or wrong');
    res
      .status(HttpStatus.FORBIDDEN)
      .json({ statusCode: HttpStatus.FORBIDDEN, message: 'Forbidden' });
  };
}
