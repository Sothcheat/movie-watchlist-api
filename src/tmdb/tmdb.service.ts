import {
  BadGatewayException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import type { Env } from '../config/env.schema.js';
import type { Movie, MovieSearchPage } from './tmdb.types.js';

/** Give up on TMDB after this long, so a slow upstream can't tie up our workers. */
export const TMDB_TIMEOUT_MS = 5000;

/**
 * Only what we use. TMDB's docs mark nothing nullable, but real responses have a null
 * poster_path and "" for release_date / overview, so the schema accepts both.
 * Unknown fields are dropped, and a response that doesn't fit is rejected (502).
 */
const movieSchema = z.object({
  id: z.number().int().positive(),
  title: z.string(),
  overview: z.string().nullish(),
  poster_path: z.string().nullish(),
  release_date: z.union([z.literal(''), z.iso.date()]).nullish(),
});

const searchSchema = z.object({
  page: z.number().int().positive(),
  total_pages: z.number().int().nonnegative(),
  total_results: z.number().int().nonnegative(),
  results: z.array(movieSchema),
});

type RawMovie = z.infer<typeof movieSchema>;

/** A failed call to TMDB. `status` is the HTTP status, or null for timeouts and network errors. */
class TmdbRequestError extends Error {
  constructor(
    readonly status: number | null,
    message: string,
  ) {
    super(message);
  }
}

const toMovie = (raw: RawMovie): Movie => ({
  tmdbId: raw.id,
  title: raw.title,
  overview: raw.overview || null,
  posterPath: raw.poster_path ?? null,
  releaseDate: raw.release_date || null,
});

@Injectable()
export class TmdbService {
  private readonly logger = new Logger(TmdbService.name);
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(config: ConfigService<Env, true>) {
    this.baseUrl = config.get('TMDB_BASE_URL', { infer: true });
    this.token = config.get('TMDB_ACCESS_TOKEN', { infer: true });
  }

  async searchMovies(query: string, page: number): Promise<MovieSearchPage> {
    try {
      const body = await this.getJson(
        '/search/movie',
        searchSchema,
        // URLSearchParams encodes the user's text, so it can't change the path or add parameters.
        new URLSearchParams({
          query,
          page: String(page),
          include_adult: 'false',
        }),
      );
      return {
        page: body.page,
        totalPages: body.total_pages,
        totalResults: body.total_results,
        results: body.results.map(toMovie),
      };
    } catch (error) {
      throw this.toHttpException(error);
    }
  }

  /** @param tmdbId a positive integer; callers validate it, as it goes straight into the URL path. */
  async getMovie(tmdbId: number): Promise<Movie> {
    try {
      return toMovie(await this.getJson(`/movie/${tmdbId}`, movieSchema));
    } catch (error) {
      throw this.toHttpException(error, 'Movie not found');
    }
  }

  private async getJson<T>(
    path: string,
    schema: z.ZodType<T>,
    params?: URLSearchParams,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}${params ? `?${params}` : ''}`;

    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(TMDB_TIMEOUT_MS),
        // The API doesn't redirect; refuse to follow one rather than chase it with our token.
        redirect: 'error',
      });
    } catch (error) {
      // TimeoutError (see TMDB_TIMEOUT_MS) or a network failure.
      throw new TmdbRequestError(
        null,
        error instanceof Error ? error.name : 'unknown error',
      );
    }

    if (!response.ok) {
      throw new TmdbRequestError(response.status, `HTTP ${response.status}`);
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch {
      throw new TmdbRequestError(response.status, 'response is not valid JSON');
    }

    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      const fields = parsed.error.issues
        .map((i) => i.path.join('.'))
        .join(', ');
      throw new TmdbRequestError(
        response.status,
        `unexpected response shape (${fields})`,
      );
    }
    return parsed.data;
  }

  /**
   * What the client sees: 404 only for a missing movie, 503 when TMDB throttles us, and a
   * generic 502 for everything else. Details go to our log, never to the client, and the
   * token is never part of any message.
   */
  private toHttpException(error: unknown, notFoundMessage?: string): Error {
    if (
      error instanceof HttpException ||
      !(error instanceof TmdbRequestError)
    ) {
      return error as Error;
    }

    if (error.status === 404 && notFoundMessage) {
      return new NotFoundException(notFoundMessage);
    }
    if (error.status === 429) {
      this.logger.warn('TMDB rate limit reached (429)');
      return new ServiceUnavailableException(
        'Movie service is busy, try again shortly',
      );
    }

    // 401/403 mean our own token was rejected: that's our config problem, so say so loudly.
    const level =
      error.status === 401 || error.status === 403 ? 'error' : 'warn';
    this.logger[level](`TMDB request failed: ${error.message}`);
    return new BadGatewayException('Movie service unavailable');
  }
}
