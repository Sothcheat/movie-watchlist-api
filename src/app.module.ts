import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CommonModule } from './common/common.module.js';
import { envSchema } from './config/env.schema.js';
import { DatabaseModule } from './database/database.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // Standard Schema validation: the app refuses to boot on a bad or missing variable.
      validationSchema: envSchema,
    }),
    CommonModule,
    DatabaseModule,
  ],
})
export class AppModule {}
