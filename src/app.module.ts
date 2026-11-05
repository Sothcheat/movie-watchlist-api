import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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
    DatabaseModule,
  ],
})
export class AppModule {}
