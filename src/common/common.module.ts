import { Module, ValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { AllExceptionsFilter } from './filters/all-exceptions.filter.js';
import { LoggingInterceptor } from './interceptors/logging.interceptor.js';

/**
 * Registers the global pipe, filter and interceptor as providers (not in main.ts)
 * so they also apply to apps built from AppModule in e2e tests.
 */
@Module({
  providers: [
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true, // strip properties without a validation decorator
        forbidNonWhitelisted: true, // ...and reject the request instead of silently dropping them
        transform: true, // payloads become DTO instances, :id params get their declared type
      }),
    },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  ],
})
export class CommonModule {}
