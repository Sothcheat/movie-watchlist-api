import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  WATCHLIST_ITEM_CREATED,
  WatchlistItemCreatedEvent,
} from './watchlist-item-created.event.js';

/**
 * Reacts to watchlist events. A listener that throws is caught and logged by the event emitter
 * (suppressErrors defaults to true), so it can never fail the request that emitted the event.
 */
@Injectable()
export class WatchlistEventsListener {
  private readonly logger = new Logger('WatchlistEvents');

  @OnEvent(WATCHLIST_ITEM_CREATED)
  handleItemCreated(event: WatchlistItemCreatedEvent): void {
    // The title comes from TMDB: JSON.stringify escapes newlines so it can't forge log lines.
    this.logger.log(
      `User ${event.userId} added ${JSON.stringify(event.title)} (tmdb ${event.tmdbId}) as item ${event.itemId}`,
    );
  }
}
