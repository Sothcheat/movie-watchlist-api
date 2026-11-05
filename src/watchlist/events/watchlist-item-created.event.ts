export const WATCHLIST_ITEM_CREATED = 'watchlist.item.created';

/** Emitted after a movie is saved to a user's watchlist. */
export class WatchlistItemCreatedEvent {
  constructor(
    readonly itemId: string,
    readonly userId: string,
    readonly tmdbId: number,
    readonly title: string,
  ) {}
}
