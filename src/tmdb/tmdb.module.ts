import { Module } from '@nestjs/common';
import { MoviesController } from './movies.controller.js';
import { TmdbService } from './tmdb.service.js';

@Module({
  controllers: [MoviesController],
  providers: [TmdbService],
  exports: [TmdbService],
})
export class TmdbModule {}
