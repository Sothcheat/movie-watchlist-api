import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { originSecretMiddleware } from './common/middleware/origin-secret.middleware.js';
import type { Env } from './config/env.schema.js';
import { setupSwagger } from './swagger.setup.js';

export const GLOBAL_PREFIX = 'api';

/** Middleware and HTTP settings shared by main.ts and e2e tests. */
export function configureApp(app: INestApplication): void {
  const originSecret = app
    .get<ConfigService<Env, true>>(ConfigService)
    .get('ORIGIN_SECRET', { infer: true });

  app.setGlobalPrefix(GLOBAL_PREFIX);
  // First, so a request that bypassed the Vercel proxy gets no further.
  if (originSecret) {
    app.use(originSecretMiddleware(originSecret));
  }
  app.use(helmet());
  // Every response is per-user or fresh upstream data, so no CDN or browser may store it.
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use(cookieParser());
  setupSwagger(app);
}
