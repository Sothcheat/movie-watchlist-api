import { BadGatewayException, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TmdbService } from '../tmdb/tmdb.service.js';
import { WatchlistItem } from './watchlist-item.entity.js';
import {
  REFRESH_BATCH_SIZE,
  REFRESH_MAX_MOVIES_PER_RUN,
  WatchlistSnapshotRefreshService,
} from './watchlist-snapshot-refresh.service.js';

const NOW = new Date('2026-11-05T04:00:00.000Z');
const CUTOFF = new Date('2026-06-08T04:00:00.000Z'); // NOW - 150 days

const movie = (tmdbId: number) => ({
  tmdbId,
  title: `Movie ${tmdbId}`,
  overview: null,
  posterPath: null,
  releaseDate: null,
});
const rows = (...ids: number[]) => ids.map((tmdbId) => ({ tmdbId }));
const range = (from: number, count: number) =>
  Array.from({ length: count }, (_, i) => from + i);

describe('WatchlistSnapshotRefreshService', () => {
  let service: WatchlistSnapshotRefreshService;
  const qb = {
    select: vi.fn(),
    where: vi.fn(),
    andWhere: vi.fn(),
    groupBy: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    getRawMany: vi.fn(),
  };
  const items = { createQueryBuilder: vi.fn(), update: vi.fn() };
  const tmdb = { getMovie: vi.fn() };
  const config = { get: vi.fn() };

  beforeEach(async () => {
    vi.resetAllMocks();
    for (const key of [
      'select',
      'where',
      'andWhere',
      'groupBy',
      'orderBy',
      'limit',
    ] as const) {
      qb[key].mockReturnValue(qb);
    }
    items.createQueryBuilder.mockReturnValue(qb);
    tmdb.getMovie.mockImplementation((id: number) =>
      Promise.resolve(movie(id)),
    );

    const moduleRef = await Test.createTestingModule({
      providers: [
        WatchlistSnapshotRefreshService,
        { provide: getRepositoryToken(WatchlistItem), useValue: items },
        { provide: TmdbService, useValue: tmdb },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();
    service = moduleRef.get(WatchlistSnapshotRefreshService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('selects distinct stale movies older than 150 days, in tmdbId order', async () => {
    qb.getRawMany.mockResolvedValueOnce([]);

    await expect(service.refreshStale(NOW)).resolves.toEqual({
      refreshed: 0,
      missing: 0,
    });
    expect(qb.where).toHaveBeenCalledWith('item.syncedAt < :cutoff', {
      cutoff: CUTOFF,
    });
    expect(qb.andWhere).toHaveBeenCalledWith('item.tmdbId > :afterTmdbId', {
      afterTmdbId: 0,
    });
    expect(qb.groupBy).toHaveBeenCalledWith('item.tmdbId');
    expect(qb.orderBy).toHaveBeenCalledWith('item.tmdbId', 'ASC');
    expect(qb.limit).toHaveBeenCalledWith(REFRESH_BATCH_SIZE);
  });

  it('re-fetches each movie once and updates every row for it, stamping syncedAt', async () => {
    qb.getRawMany.mockResolvedValueOnce(rows(10, 20));

    await expect(service.refreshStale(NOW)).resolves.toEqual({
      refreshed: 2,
      missing: 0,
    });
    expect(tmdb.getMovie).toHaveBeenCalledTimes(2);
    expect(items.update).toHaveBeenCalledWith(
      { tmdbId: 10 },
      {
        title: 'Movie 10',
        overview: null,
        posterPath: null,
        releaseDate: null,
        syncedAt: NOW,
      },
    );
  });

  it('continues after the last tmdbId of a full batch (keyset), stopping on a short batch', async () => {
    qb.getRawMany
      .mockResolvedValueOnce(rows(...range(1, REFRESH_BATCH_SIZE)))
      .mockResolvedValueOnce(rows(500));

    await expect(service.refreshStale(NOW)).resolves.toEqual({
      refreshed: REFRESH_BATCH_SIZE + 1,
      missing: 0,
    });
    expect(qb.getRawMany).toHaveBeenCalledTimes(2);
    expect(qb.andWhere).toHaveBeenLastCalledWith('item.tmdbId > :afterTmdbId', {
      afterTmdbId: REFRESH_BATCH_SIZE,
    });
  });

  it('keeps items for a movie TMDB no longer has, and moves on', async () => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    qb.getRawMany.mockResolvedValueOnce(rows(10, 20, 30));
    tmdb.getMovie.mockImplementation((id: number) =>
      id === 20
        ? Promise.reject(new NotFoundException('Movie not found'))
        : Promise.resolve(movie(id)),
    );

    await expect(service.refreshStale(NOW)).resolves.toEqual({
      refreshed: 2,
      missing: 1,
    });
    expect(items.update).not.toHaveBeenCalledWith(
      { tmdbId: 20 },
      expect.anything(),
    );
    expect(items.update).toHaveBeenCalledWith(
      { tmdbId: 30 },
      expect.anything(),
    );
  });

  it('stops the whole run when TMDB fails (502/503), leaving the rest for tomorrow', async () => {
    qb.getRawMany.mockResolvedValueOnce(rows(10, 20, 30));
    tmdb.getMovie.mockImplementation((id: number) =>
      id === 20
        ? Promise.reject(new BadGatewayException())
        : Promise.resolve(movie(id)),
    );

    await expect(service.refreshStale(NOW)).rejects.toBeInstanceOf(
      BadGatewayException,
    );
    expect(tmdb.getMovie).toHaveBeenCalledTimes(2);
    expect(items.update).toHaveBeenCalledTimes(1);
  });

  it(`refreshes at most ${REFRESH_MAX_MOVIES_PER_RUN} movies per run`, async () => {
    let next = 1;
    qb.getRawMany.mockImplementation(() => {
      const batch = rows(...range(next, REFRESH_BATCH_SIZE));
      next += REFRESH_BATCH_SIZE;
      return Promise.resolve(batch);
    });

    const result = await service.refreshStale(NOW);

    expect(result.refreshed).toBe(REFRESH_MAX_MOVIES_PER_RUN);
    expect(tmdb.getMovie).toHaveBeenCalledTimes(REFRESH_MAX_MOVIES_PER_RUN);
  });

  describe('handleCron', () => {
    it('logs the counts', async () => {
      const log = vi
        .spyOn(Logger.prototype, 'log')
        .mockImplementation(() => undefined);
      qb.getRawMany.mockResolvedValueOnce(rows(10));

      await service.handleCron();

      expect(log).toHaveBeenCalledWith(
        'Refreshed 1 movie snapshot(s); 0 no longer on TMDB',
      );
    });

    it('logs an error instead of throwing when TMDB is down', async () => {
      const error = vi
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);
      qb.getRawMany.mockResolvedValueOnce(rows(10));
      tmdb.getMovie.mockRejectedValue(new BadGatewayException());

      await expect(service.handleCron()).resolves.toBeUndefined();
      expect(error).toHaveBeenCalledWith(
        'Watchlist snapshot refresh stopped early',
        expect.any(String),
      );
    });
  });

  describe('onApplicationBootstrap', () => {
    it('runs the refresh once in production, without waiting for it', () => {
      config.get.mockReturnValue('production');
      const run = vi
        .spyOn(service, 'handleCron')
        .mockReturnValue(new Promise(() => undefined));

      expect(service.onApplicationBootstrap()).toBeUndefined();
      expect(config.get).toHaveBeenCalledWith('NODE_ENV', { infer: true });
      expect(run).toHaveBeenCalledOnce();
    });

    it.each(['development', 'test'])('does nothing in %s', (env) => {
      config.get.mockReturnValue(env);
      const run = vi.spyOn(service, 'handleCron');

      service.onApplicationBootstrap();

      expect(run).not.toHaveBeenCalled();
    });
  });
});
