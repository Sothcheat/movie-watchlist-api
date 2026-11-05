import {
  BadGatewayException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { TMDB_TIMEOUT_MS, TmdbService } from './tmdb.service.js';

const TOKEN = 'tmdb-secret-token-value';
const BASE_URL = 'https://tmdb.test/3';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const rawDune = {
  id: 438631,
  title: 'Dune',
  overview: "A mythic and emotionally charged hero's journey.",
  poster_path: '/poster.jpg',
  release_date: '2021-09-15',
  // fields we don't use must be dropped
  backdrop_path: '/backdrop.jpg',
  vote_average: 7.8,
  genre_ids: [878],
};

describe('TmdbService', () => {
  let service: TmdbService;
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
    warnSpy = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    errorSpy = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    const moduleRef = await Test.createTestingModule({
      providers: [
        TmdbService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              ({ TMDB_BASE_URL: BASE_URL, TMDB_ACCESS_TOKEN: TOKEN })[key],
          },
        },
      ],
    }).compile();
    service = moduleRef.get(TmdbService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('request', () => {
    it('authenticates with the bearer token and sets a timeout and no-redirect policy', async () => {
      fetchSpy.mockResolvedValue(json(rawDune));

      await service.getMovie(438631);

      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/movie/438631`);
      expect(init.headers).toEqual({
        Authorization: `Bearer ${TOKEN}`,
        Accept: 'application/json',
      });
      expect(init.redirect).toBe('error');
      expect(init.signal).toBeInstanceOf(AbortSignal);
      expect(TMDB_TIMEOUT_MS).toBeGreaterThan(0);
    });

    it('encodes the search text so it cannot alter the path or add parameters', async () => {
      fetchSpy.mockResolvedValue(
        json({ page: 2, total_pages: 5, total_results: 90, results: [] }),
      );

      await service.searchMovies('a&b=c#d/../e', 2);

      const url = new URL(fetchSpy.mock.calls[0][0] as string);
      expect(url.pathname).toBe('/3/search/movie');
      expect(url.hash).toBe('');
      expect([...url.searchParams.keys()].sort()).toEqual([
        'include_adult',
        'page',
        'query',
      ]);
      expect(url.searchParams.get('query')).toBe('a&b=c#d/../e');
      expect(url.searchParams.get('page')).toBe('2');
      expect(url.searchParams.get('include_adult')).toBe('false');
    });
  });

  describe('responses', () => {
    it('maps a search page, normalising nulls and empty strings and dropping unused fields', async () => {
      fetchSpy.mockResolvedValue(
        json({
          page: 1,
          total_pages: 3,
          total_results: 41,
          results: [
            rawDune,
            {
              id: 2,
              title: 'No extras',
              overview: '',
              poster_path: null,
              release_date: '',
            },
            { id: 3, title: 'Missing fields' },
          ],
        }),
      );

      const page = await service.searchMovies('dune', 1);

      expect(page).toEqual({
        page: 1,
        totalPages: 3,
        totalResults: 41,
        results: [
          {
            tmdbId: 438631,
            title: 'Dune',
            overview: rawDune.overview,
            posterPath: '/poster.jpg',
            releaseDate: '2021-09-15',
          },
          {
            tmdbId: 2,
            title: 'No extras',
            overview: null,
            posterPath: null,
            releaseDate: null,
          },
          {
            tmdbId: 3,
            title: 'Missing fields',
            overview: null,
            posterPath: null,
            releaseDate: null,
          },
        ],
      });
      expect(JSON.stringify(page)).not.toContain('vote_average');
    });

    it('maps a single movie', async () => {
      fetchSpy.mockResolvedValue(json(rawDune));

      await expect(service.getMovie(438631)).resolves.toEqual({
        tmdbId: 438631,
        title: 'Dune',
        overview: rawDune.overview,
        posterPath: '/poster.jpg',
        releaseDate: '2021-09-15',
      });
    });
  });

  describe('failures', () => {
    it('turns a TMDB 404 into a 404 for a single movie', async () => {
      fetchSpy.mockResolvedValue(json({ status_code: 34 }, 404));

      await expect(service.getMovie(999)).rejects.toEqual(
        new NotFoundException('Movie not found'),
      );
    });

    it('does not pass a TMDB 404 on a search through as a 404', async () => {
      fetchSpy.mockResolvedValue(json({ status_code: 34 }, 404));

      await expect(service.searchMovies('x', 1)).rejects.toBeInstanceOf(
        BadGatewayException,
      );
    });

    it('turns TMDB throttling (429) into a 503 and logs it', async () => {
      fetchSpy.mockResolvedValue(json({}, 429));

      await expect(service.getMovie(1)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(warnSpy).toHaveBeenCalledWith('TMDB rate limit reached (429)');
    });

    it.each([500, 502, 503, 504])(
      'turns a TMDB %i into a 502',
      async (status) => {
        fetchSpy.mockResolvedValue(json({}, status));

        await expect(service.getMovie(1)).rejects.toBeInstanceOf(
          BadGatewayException,
        );
      },
    );

    it('reports a rejected token (401) as a 502 and logs it as an error, without the token', async () => {
      fetchSpy.mockResolvedValue(json({ status_code: 7 }, 401));

      const error = await service.getMovie(1).catch((e: Error) => e);

      expect(error).toBeInstanceOf(BadGatewayException);
      expect(JSON.stringify(error)).not.toContain(TOKEN);
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(String(errorSpy.mock.calls[0][0])).toContain('HTTP 401');
      expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(TOKEN);
    });

    it('turns a timeout into a 502', async () => {
      fetchSpy.mockRejectedValue(new DOMException('timed out', 'TimeoutError'));

      await expect(service.getMovie(1)).rejects.toBeInstanceOf(
        BadGatewayException,
      );
      expect(String(warnSpy.mock.calls[0][0])).toContain('TimeoutError');
    });

    it('turns a network failure into a 502 and keeps the URL and token out of the log', async () => {
      fetchSpy.mockRejectedValue(
        Object.assign(new TypeError('fetch failed'), {
          cause: new Error(`connect ECONNREFUSED Bearer ${TOKEN}`),
        }),
      );

      await expect(service.getMovie(1)).rejects.toBeInstanceOf(
        BadGatewayException,
      );
      expect(JSON.stringify(warnSpy.mock.calls)).not.toContain(TOKEN);
    });

    it.each([
      ['a body that is not JSON', () => new Response('<html>oops</html>')],
      ['a movie with a string id', () => json({ id: '1', title: 'x' })],
      ['a movie without a title', () => json({ id: 1 })],
      [
        'an impossible release date',
        () => json({ id: 1, title: 'x', release_date: '2021-02-30' }),
      ],
      [
        'a release date in another format',
        () => json({ id: 1, title: 'x', release_date: '09/15/2021' }),
      ],
    ])('rejects %s with a 502', async (_label, makeResponse) => {
      fetchSpy.mockResolvedValue(makeResponse());

      await expect(service.getMovie(1)).rejects.toBeInstanceOf(
        BadGatewayException,
      );
    });

    it('rejects a search page with a malformed result', async () => {
      fetchSpy.mockResolvedValue(
        json({
          page: 1,
          total_pages: 1,
          total_results: 1,
          results: [{ id: 1, title: 42 }],
        }),
      );

      await expect(service.searchMovies('x', 1)).rejects.toBeInstanceOf(
        BadGatewayException,
      );
    });
  });
});
