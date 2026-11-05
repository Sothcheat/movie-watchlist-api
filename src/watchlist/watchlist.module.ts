import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TmdbModule } from '../tmdb/tmdb.module.js';
import { WatchlistEventsListener } from './events/watchlist-events.listener.js';
import { WatchlistItem } from './watchlist-item.entity.js';
import { WatchlistSnapshotRefreshService } from './watchlist-snapshot-refresh.service.js';
import { WatchlistController } from './watchlist.controller.js';
import { WatchlistService } from './watchlist.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([WatchlistItem]), TmdbModule],
  controllers: [WatchlistController],
  providers: [
    WatchlistService,
    WatchlistSnapshotRefreshService,
    WatchlistEventsListener,
  ],
})
export class WatchlistModule {}
