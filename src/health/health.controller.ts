import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator.js';

@Controller('health')
export class HealthController {
  /** Liveness only. It never queries the database, so frequent checks can't keep it awake. */
  @Public()
  @SkipThrottle()
  @Get()
  check() {
    return { status: 'ok' };
  }
}
