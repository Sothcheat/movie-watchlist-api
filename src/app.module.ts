import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { minutes, ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import type { Request } from 'express';
import { AuthModule } from './auth/auth.module.js';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard.js';
import { clientIp } from './common/client-ip.js';
import { CommonModule } from './common/common.module.js';
import { envSchema, type Env } from './config/env.schema.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';
import { TmdbModule } from './tmdb/tmdb.module.js';
import { UsersModule } from './users/users.module.js';
import { WatchlistModule } from './watchlist/watchlist.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validationSchema: envSchema,
      // Tests get every variable from test/setup-env.ts, never from a developer's .env.
      ignoreEnvFile: process.env.NODE_ENV === 'test',
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const behindVercel = Boolean(
          config.get('ORIGIN_SECRET', { infer: true }),
        );
        return {
          throttlers: [{ ttl: minutes(1), limit: 100 }],
          getTracker: (req) => clientIp(req as Request, behindVercel),
        };
      },
    }),
    // Call forRoot() once only: each extra import would register every @Cron job again.
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),
    CommonModule,
    DatabaseModule,
    UsersModule,
    AuthModule,
    TmdbModule,
    WatchlistModule,
    HealthModule,
  ],
  providers: [
    // Order matters: rate limiting runs before authentication.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
