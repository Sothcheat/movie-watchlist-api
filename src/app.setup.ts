import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';

export const GLOBAL_PREFIX = 'api';

/** Middleware and HTTP settings shared by main.ts and e2e tests. */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix(GLOBAL_PREFIX);
  app.use(helmet());
  // Every response is per-user or fresh upstream data, so no CDN or browser may store it.
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use(cookieParser());
}
