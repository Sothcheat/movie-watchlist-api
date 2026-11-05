import { Module } from '@nestjs/common';
import { MoviesController } from './movies.controller.js';
import { TmdbService } from './tmdb.service.js';

@Module({
  controllers: [MoviesController],
  providers: [TmdbService],
  // The watchlist module fetches the movie snapshot through this service.
  exports: [TmdbService],
})
export class TmdbModule {}
