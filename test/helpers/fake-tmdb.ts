import { NotFoundException } from '@nestjs/common';
import type { TmdbService } from '../../src/tmdb/tmdb.service.js';
import type { Movie } from '../../src/tmdb/tmdb.types.js';

export const DUNE: Movie = {
  tmdbId: 438631,
  title: 'Dune',
  overview: 'Paul Atreides leads a rebellion.',
  posterPath: '/dune.jpg',
  releaseDate: '2021-09-15',
};
export const DUNE_PART_TWO: Movie = {
  tmdbId: 693134,
  title: 'Dune: Part Two',
  overview: null,
  posterPath: '/dune2.jpg',
  releaseDate: '2024-02-27',
};
export const THE_MATRIX: Movie = {
  tmdbId: 603,
  title: 'The Matrix',
  overview: 'A hacker learns the truth.',
  posterPath: null,
  releaseDate: '1999-03-30',
};

const CATALOGUE = [DUNE, DUNE_PART_TWO, THE_MATRIX];

/** In-memory stand-in for TmdbService, so e2e tests are fast, offline and deterministic. */
export class FakeTmdbService implements Pick<
  TmdbService,
  'searchMovies' | 'getMovie'
> {
  searchMovies(query: string, page: number) {
    const results = CATALOGUE.filter((m) =>
      m.title.toLowerCase().includes(query.toLowerCase()),
    );
    return Promise.resolve({
      page,
      totalPages: 1,
      totalResults: results.length,
      results: page === 1 ? results : [],
    });
  }

  getMovie(tmdbId: number) {
    const movie = CATALOGUE.find((m) => m.tmdbId === tmdbId);
    return movie
      ? Promise.resolve({ ...movie })
      : Promise.reject(new NotFoundException('Movie not found'));
  }
}
