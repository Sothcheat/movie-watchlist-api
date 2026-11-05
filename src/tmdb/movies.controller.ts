import { Controller, Get, Param, Query } from '@nestjs/common';
import { minutes, Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator.js';
import { SearchMoviesDto } from './dto/search-movies.dto.js';
import { ParseTmdbIdPipe } from './pipes/parse-tmdb-id.pipe.js';
import { TmdbService } from './tmdb.service.js';

/** Public routes that spend our TMDB quota, so each client IP gets a tighter limit. */
const MOVIES_THROTTLE = { default: { limit: 30, ttl: minutes(1) } };

@Public()
@Throttle(MOVIES_THROTTLE)
@Controller('movies')
export class MoviesController {
  constructor(private readonly tmdb: TmdbService) {}

  // Declared before ':tmdbId' so "search" isn't read as an id.
  @Get('search')
  search(@Query() { query, page }: SearchMoviesDto) {
    return this.tmdb.searchMovies(query, page);
  }

  @Get(':tmdbId')
  findOne(@Param('tmdbId', ParseTmdbIdPipe) tmdbId: number) {
    return this.tmdb.getMovie(tmdbId);
  }
}
