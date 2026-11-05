import type { WatchlistItem, WatchPriority } from './watchlist-item.entity.js';

/** What clients see. `userId` and `syncedAt` are internal and never leave the API. */
export interface WatchlistItemView {
  id: string;
  tmdbId: number;
  title: string;
  overview: string | null;
  posterPath: string | null;
  releaseDate: string | null;
  watched: boolean;
  watchedAt: Date | null;
  rating: number | null;
  priority: WatchPriority;
  createdAt: Date;
  updatedAt: Date;
}

export interface WatchlistPage {
  items: WatchlistItemView[];
  total: number;
  page: number;
  limit: number;
}

export const toView = (item: WatchlistItem): WatchlistItemView => ({
  id: item.id,
  tmdbId: item.tmdbId,
  title: item.title,
  overview: item.overview,
  posterPath: item.posterPath,
  releaseDate: item.releaseDate,
  watched: item.watched,
  watchedAt: item.watchedAt,
  rating: item.rating,
  priority: item.priority,
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
});
