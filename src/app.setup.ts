import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import type { Env } from './config/env.schema.js';

/** Middleware and HTTP settings shared by main.ts and e2e tests. */
export function configureApp(app: INestApplication): void {
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    // Exact-match allowlist; credentials are on for the refresh-token cookie.
    origin: config.get('CORS_ORIGINS', { infer: true }),
    credentials: true,
  });
}
