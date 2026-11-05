import { INestApplication, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { CommonModule } from '../common/common.module.js';
import { MoviesController } from './movies.controller.js';
import { TmdbService } from './tmdb.service.js';

const movie = {
  tmdbId: 438631,
  title: 'Dune',
  overview: null,
  posterPath: null,
  releaseDate: '2021-09-15',
};

describe('MoviesController', () => {
  let app: INestApplication;
  const tmdb = { searchMovies: vi.fn(), getMovie: vi.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [CommonModule],
      controllers: [MoviesController],
      providers: [{ provide: TmdbService, useValue: tmdb }],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
  });

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /movies/search', () => {
    const page = { page: 1, totalPages: 1, totalResults: 1, results: [movie] };

    it('searches TMDB, defaulting to page 1', async () => {
      tmdb.searchMovies.mockResolvedValue(page);

      await request(app.getHttpServer())
        .get('/movies/search?query=dune')
        .expect(200, page);
      expect(tmdb.searchMovies).toHaveBeenCalledWith('dune', 1);
    });

    it('trims the query and passes the page as a number', async () => {
      tmdb.searchMovies.mockResolvedValue(page);

      await request(app.getHttpServer())
        .get('/movies/search?query=%20%20dune%20&page=3')
        .expect(200);
      expect(tmdb.searchMovies).toHaveBeenCalledWith('dune', 3);
    });

    it.each([
      ['no query', ''],
      ['an empty query', '?query='],
      ['a whitespace-only query', '?query=%20%20'],
      ['a query over 100 characters', `?query=${'a'.repeat(101)}`],
      ['a repeated query', '?query=a&query=b'],
      ['page 0', '?query=dune&page=0'],
      ['page 501', '?query=dune&page=501'],
      ['a fractional page', '?query=dune&page=1.5'],
      ['a non-numeric page', '?query=dune&page=abc'],
      ['an unknown parameter', '?query=dune&include_adult=true'],
    ])('rejects %s with 400 before calling TMDB', async (_label, qs) => {
      await request(app.getHttpServer()).get(`/movies/search${qs}`).expect(400);
      expect(tmdb.searchMovies).not.toHaveBeenCalled();
    });

    it('accepts the boundary values: a 100-character query and pages 1 and 500', async () => {
      tmdb.searchMovies.mockResolvedValue(page);

      for (const p of [1, 500]) {
        await request(app.getHttpServer())
          .get(`/movies/search?query=${'a'.repeat(100)}&page=${p}`)
          .expect(200);
      }
    });
  });

  describe('GET /movies/:tmdbId', () => {
    it('returns the movie', async () => {
      tmdb.getMovie.mockResolvedValue(movie);

      await request(app.getHttpServer())
        .get('/movies/438631')
        .expect(200, movie);
      expect(tmdb.getMovie).toHaveBeenCalledWith(438631);
    });

    it('passes a missing movie through as 404', async () => {
      tmdb.getMovie.mockRejectedValue(new NotFoundException('Movie not found'));

      const res = await request(app.getHttpServer())
        .get('/movies/999')
        .expect(404);
      expect(res.body.message).toBe('Movie not found');
    });

    it.each([
      'abc',
      '0',
      '-1',
      '1.5',
      'NaN',
      'Infinity',
      '1e21',
      '2147483648',
      '99999999999',
    ])('rejects the id %j with 400 before calling TMDB', async (id) => {
      await request(app.getHttpServer())
        .get(`/movies/${encodeURIComponent(id)}`)
        .expect(400);
      expect(tmdb.getMovie).not.toHaveBeenCalled();
    });

    it('accepts the largest 32-bit id', async () => {
      tmdb.getMovie.mockResolvedValue(movie);

      await request(app.getHttpServer()).get('/movies/2147483647').expect(200);
      expect(tmdb.getMovie).toHaveBeenCalledWith(2147483647);
    });

    it('does not treat "search" as an id', async () => {
      await request(app.getHttpServer()).get('/movies/search').expect(400);
      expect(tmdb.getMovie).not.toHaveBeenCalled();
    });
  });
});
