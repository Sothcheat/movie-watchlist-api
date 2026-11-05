import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { minutes, ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module.js';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard.js';
import { CommonModule } from './common/common.module.js';
import { envSchema } from './config/env.schema.js';
import { DatabaseModule } from './database/database.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // Standard Schema validation: the app refuses to boot on a bad or missing variable.
      validationSchema: envSchema,
    }),
    // Default limit per client IP; auth routes tighten it with @Throttle().
    ThrottlerModule.forRoot({ throttlers: [{ ttl: minutes(1), limit: 100 }] }),
    // Call forRoot() once only: each extra import would register every @Cron job again.
    ScheduleModule.forRoot(),
    CommonModule,
    DatabaseModule,
    UsersModule,
    AuthModule,
  ],
  providers: [
    // Order matters: rate limiting runs before authentication.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
