import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

/** TMDB ids are positive 32-bit integers (the watchlist stores them in an `integer` column). */
export const MAX_TMDB_ID = 2_147_483_647;

/**
 * Range-checks the id before it is put into a URL path.
 *
 * It expects a number, not a string: the global ValidationPipe (transform: true) runs first and
 * already coerces a path parameter declared as `number`, turning garbage into NaN. That coercion
 * is lenient, so "1e3" and "0x10" arrive as 1000 and 16; both are ordinary valid ids. Anything
 * that is not a positive 32-bit integer, including a string (no global pipe), is rejected.
 */
@Injectable()
export class ParseTmdbIdPipe implements PipeTransform<unknown, number> {
  transform(value: unknown): number {
    if (
      typeof value !== 'number' ||
      !Number.isInteger(value) ||
      value < 1 ||
      value > MAX_TMDB_ID
    ) {
      throw new BadRequestException('tmdbId must be a positive integer');
    }
    return value;
  }
}
