import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { Env } from './config/env.schema.js';

export const SWAGGER_PATH = 'api/docs';

/** Serves the OpenAPI docs at /api/docs (JSON at /api/docs-json), except in production. */
export function setupSwagger(app: INestApplication): void {
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  if (config.get('NODE_ENV', { infer: true }) === 'production') {
    return;
  }

  const document = new DocumentBuilder()
    .setTitle('Movie Watchlist API')
    .setDescription('Search TMDB and keep a personal movie watchlist.')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup(SWAGGER_PATH, app, () =>
    SwaggerModule.createDocument(app, document),
  );
}
