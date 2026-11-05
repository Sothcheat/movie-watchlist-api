import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import type { Env } from '../config/env.schema.js';
import { RefreshToken } from './refresh-token.entity.js';

/** Rows deleted per statement, so a large backlog never holds a long lock. */
export const PURGE_BATCH_SIZE = 1000;

/**
 * Deletes refresh-token rows once their token expired more than REFRESH_TOKEN_RETENTION ago.
 *
 * Used and revoked rows are deliberately kept until then: reuse detection needs the "used"
 * row for as long as the JWT could still be presented. After the JWT's own expiry the
 * strategy rejects it before the database is consulted, so the row is no longer needed.
 */
@Injectable()
export class RefreshTokenCleanupService {
  private readonly logger = new Logger(RefreshTokenCleanupService.name);

  constructor(
    @InjectRepository(RefreshToken)
    private readonly refreshTokens: Repository<RefreshToken>,
    private readonly config: ConfigService<Env, true>,
  ) {}

  // 03:00 UTC. waitForCompletion skips a tick if the previous run is still going.
  @Cron(CronExpression.EVERY_DAY_AT_3AM, {
    name: 'refresh-token-cleanup',
    timeZone: 'UTC',
    waitForCompletion: true,
  })
  async handleCron(): Promise<void> {
    try {
      const deleted = await this.purgeExpired();
      this.logger.log(`Purged ${deleted} expired refresh token(s)`);
    } catch (error) {
      // Log and carry on; tomorrow's run still happens.
      this.logger.error(
        'Refresh token purge failed',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /** Returns the number of rows deleted. */
  async purgeExpired(now: Date = new Date()): Promise<number> {
    const retentionSeconds = this.config.get('REFRESH_TOKEN_RETENTION', {
      infer: true,
    });
    const cutoff = new Date(now.getTime() - retentionSeconds * 1000);

    let total = 0;
    for (;;) {
      const batch = await this.refreshTokens.find({
        select: { id: true },
        where: { expiresAt: LessThan(cutoff) },
        take: PURGE_BATCH_SIZE,
      });
      if (batch.length === 0) {
        return total;
      }

      const result = await this.refreshTokens.delete(batch.map(({ id }) => id));
      total += result.affected ?? 0;

      if (batch.length < PURGE_BATCH_SIZE) {
        return total;
      }
    }
  }
}
