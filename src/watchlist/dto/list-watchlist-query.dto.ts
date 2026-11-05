import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { WatchPriority } from '../watchlist-item.entity.js';

export const MAX_PAGE_SIZE = 100;

export class ListWatchlistQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  limit: number = 20;

  /** Only the strings "true" and "false". @Type(() => Boolean) would turn "false" into true. */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  watched?: boolean;

  @IsOptional()
  @IsEnum(WatchPriority)
  priority?: WatchPriority;
}
