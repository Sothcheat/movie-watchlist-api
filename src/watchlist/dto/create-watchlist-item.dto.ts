import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { MAX_TMDB_ID } from '../../tmdb/pipes/parse-tmdb-id.pipe.js';
import { WatchPriority } from '../watchlist-item.entity.js';

/**
 * The client only says which movie; title, poster and the rest are fetched from TMDB by the
 * server, so they can't be forged. Any other property is rejected (forbidNonWhitelisted).
 */
export class CreateWatchlistItemDto {
  /** Required. Must be a JSON number: "123" is rejected, not coerced. */
  @IsInt()
  @Min(1)
  @Max(MAX_TMDB_ID)
  tmdbId: number;

  @IsOptional()
  @IsEnum(WatchPriority)
  priority?: WatchPriority;
}
