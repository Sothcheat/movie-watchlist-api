import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { WatchPriority } from '../watchlist-item.entity.js';

/**
 * Only the user's own fields; the TMDB snapshot isn't updatable. Every field is optional, but
 * an omitted field and `null` mean different things, so:
 * - watched, priority: may be omitted, but `null` is rejected (ValidateIf, not IsOptional).
 * - rating: may be omitted (unchanged) or `null` (clear the rating).
 */
export class UpdateWatchlistItemDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean()
  watched?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  rating?: number | null;

  @ValidateIf((_, value) => value !== undefined)
  @IsEnum(WatchPriority)
  priority?: WatchPriority;
}
