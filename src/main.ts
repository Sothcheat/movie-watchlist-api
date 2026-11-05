import { ConsoleLogger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import type { Env } from './config/env.schema.js';

async function bootstrap() {
  // One JSON object per line in production, so Render's log search can filter on fields.
  const app = await NestFactory.create(AppModule, {
    logger:
      process.env.NODE_ENV === 'production'
        ? new ConsoleLogger({ json: true })
        : undefined,
  });
  configureApp(app);
  // Close the HTTP server and the database pool cleanly on SIGTERM/SIGINT (docker stop).
  app.enableShutdownHooks();

  const config = app.get<ConfigService<Env, true>>(ConfigService);
  await app.listen(config.get('PORT', { infer: true }));
}
await bootstrap();
