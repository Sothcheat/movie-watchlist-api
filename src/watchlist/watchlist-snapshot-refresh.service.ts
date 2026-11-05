import {
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Env } from '../config/env.schema.js';
import { TmdbService } from '../tmdb/tmdb.service.js';
import { WatchlistItem } from './watchlist-item.entity.js';

/**
 * TMDB's terms forbid caching their data for more than 6 months. Re-fetching at 150 days
 * leaves a month of nightly runs to catch up if TMDB is down or a run hits its cap.
 */
export const SNAPSHOT_MAX_AGE_DAYS = 150;
/** Distinct movies fetched per query. */
export const REFRESH_BATCH_SIZE = 50;
/** Upper bound per night, so one run never sends an unbounded burst to TMDB. */
export const REFRESH_MAX_MOVIES_PER_RUN = 1000;

const DAY_MS = 86_400_000;

export interface RefreshResult {
  /** Movies whose snapshot was re-fetched (all watchlist rows for that movie updated). */
  refreshed: number;
  /** Movies TMDB no longer has; their rows are left as they were. */
  missing: number;
}

/**
 * Re-fetches stale snapshots once per movie (not per row: many users can list the same movie)
 * and updates every row for it. Walks tmdb_id in ascending order (keyset), so a movie that
 * fails is passed over instead of being retried in a loop within the same run.
 */
@Injectable()
export class WatchlistSnapshotRefreshService implements OnApplicationBootstrap {
  private readonly logger = new Logger(WatchlistSnapshotRefreshService.name);

  constructor(
    @InjectRepository(WatchlistItem)
    private readonly items: Repository<WatchlistItem>,
    private readonly tmdb: TmdbService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Same as RefreshTokenCleanupService: the 04:00 run is often slept through on Render. */
  onApplicationBootstrap(): void {
    if (this.config.get('NODE_ENV', { infer: true }) === 'production') {
      void this.handleCron();
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_4AM, {
    name: 'watchlist-snapshot-refresh',
    timeZone: 'UTC',
    waitForCompletion: true,
  })
  async handleCron(): Promise<void> {
    try {
      const { refreshed, missing } = await this.refreshStale();
      this.logger.log(
        `Refreshed ${refreshed} movie snapshot(s); ${missing} no longer on TMDB`,
      );
    } catch (error) {
      // TMDB down or throttling us: stop now and pick up the rest tomorrow.
      this.logger.error(
        'Watchlist snapshot refresh stopped early',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async refreshStale(now: Date = new Date()): Promise<RefreshResult> {
    const cutoff = new Date(now.getTime() - SNAPSHOT_MAX_AGE_DAYS * DAY_MS);
    const result: RefreshResult = { refreshed: 0, missing: 0 };
    let afterTmdbId = 0;

    for (;;) {
      const batch = await this.items
        .createQueryBuilder('item')
        .select('item.tmdbId', 'tmdbId')
        .where('item.syncedAt < :cutoff', { cutoff })
        .andWhere('item.tmdbId > :afterTmdbId', { afterTmdbId })
        .groupBy('item.tmdbId')
        .orderBy('item.tmdbId', 'ASC')
        .limit(REFRESH_BATCH_SIZE)
        .getRawMany<{ tmdbId: number }>();

      for (const { tmdbId } of batch) {
        if (result.refreshed + result.missing >= REFRESH_MAX_MOVIES_PER_RUN) {
          return result;
        }
        afterTmdbId = tmdbId;

        try {
          const movie = await this.tmdb.getMovie(tmdbId);
          await this.items.update(
            { tmdbId },
            {
              title: movie.title,
              overview: movie.overview,
              posterPath: movie.posterPath,
              releaseDate: movie.releaseDate,
              syncedAt: now,
            },
          );
          result.refreshed++;
        } catch (error) {
          if (!(error instanceof NotFoundException)) {
            throw error;
          }
          // Removed from TMDB. Keep the user's item; it's retried on later nights.
          result.missing++;
          this.logger.warn(`TMDB no longer has movie ${tmdbId}; snapshot kept`);
        }
      }

      if (batch.length < REFRESH_BATCH_SIZE) {
        return result;
      }
    }
  }
}
