import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** TMDB rejects pages outside 1-500 with a 400. */
export const TMDB_MAX_PAGE = 500;

export class SearchMoviesDto {
  /** Trimmed first, so "   " counts as empty (TMDB would quietly return no results). */
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  query: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(TMDB_MAX_PAGE)
  page: number = 1;
}
