import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TmdbService } from '../tmdb/tmdb.service.js';
import {
  WATCHLIST_ITEM_CREATED,
  WatchlistItemCreatedEvent,
} from './events/watchlist-item-created.event.js';
import { WatchlistItem, WatchPriority } from './watchlist-item.entity.js';
import { ITEM_NOT_FOUND, WatchlistService } from './watchlist.service.js';

const USER = '11111111-1111-4111-8111-111111111111';
const ITEM = '22222222-2222-4222-8222-222222222222';
const T0 = new Date('2026-11-01T10:00:00.000Z');

const dune = {
  tmdbId: 438631,
  title: 'Dune',
  overview: 'Paul Atreides...',
  posterPath: '/dune.jpg',
  releaseDate: '2021-09-15',
};

function storedItem(overrides: Partial<WatchlistItem> = {}): WatchlistItem {
  return Object.assign(new WatchlistItem(), {
    id: ITEM,
    userId: USER,
    ...dune,
    syncedAt: T0,
    watched: false,
    watchedAt: null,
    rating: null,
    priority: WatchPriority.Medium,
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  });
}

describe('WatchlistService', () => {
  let service: WatchlistService;
  const items = {
    findAndCount: vi.fn(),
    findOneBy: vi.fn(),
    existsBy: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
    delete: vi.fn(),
  };
  const tmdb = { getMovie: vi.fn() };
  const events = { emit: vi.fn() };

  beforeEach(async () => {
    vi.resetAllMocks();
    items.create.mockImplementation((fields: Partial<WatchlistItem>) => ({
      ...fields,
    }));
    items.save.mockImplementation((item: Partial<WatchlistItem>) =>
      Promise.resolve({ id: ITEM, createdAt: T0, updatedAt: T0, ...item }),
    );

    const moduleRef = await Test.createTestingModule({
      providers: [
        WatchlistService,
        { provide: getRepositoryToken(WatchlistItem), useValue: items },
        { provide: TmdbService, useValue: tmdb },
        { provide: EventEmitter2, useValue: events },
      ],
    }).compile();
    service = moduleRef.get(WatchlistService);
  });

  describe('findAll', () => {
    it('scopes to the user only when no filters are given (no undefined in where)', async () => {
      items.findAndCount.mockResolvedValue([[storedItem()], 1]);

      const result = await service.findAll(USER, { page: 1, limit: 20 });

      expect(items.findAndCount).toHaveBeenCalledWith({
        where: { userId: USER },
        order: { createdAt: 'DESC', id: 'DESC' },
        skip: 0,
        take: 20,
      });
      expect(result).toMatchObject({ total: 1, page: 1, limit: 20 });
      expect(result.items).toHaveLength(1);
    });

    it('applies filters, including watched=false, and pages with skip/take', async () => {
      items.findAndCount.mockResolvedValue([[], 45]);

      await service.findAll(USER, {
        page: 3,
        limit: 10,
        watched: false,
        priority: WatchPriority.High,
      });

      expect(items.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: USER, watched: false, priority: WatchPriority.High },
          skip: 20,
          take: 10,
        }),
      );
    });

    it('never exposes userId or syncedAt', async () => {
      items.findAndCount.mockResolvedValue([[storedItem()], 1]);

      const { items: views } = await service.findAll(USER, {
        page: 1,
        limit: 20,
      });

      expect(views[0]).not.toHaveProperty('userId');
      expect(views[0]).not.toHaveProperty('syncedAt');
      expect(views[0]).toMatchObject({
        id: ITEM,
        tmdbId: 438631,
        title: 'Dune',
      });
    });
  });

  describe('findOne', () => {
    it("looks the item up by id AND the caller's id", async () => {
      items.findOneBy.mockResolvedValue(storedItem());

      await expect(service.findOne(USER, ITEM)).resolves.toMatchObject({
        id: ITEM,
      });
      expect(items.findOneBy).toHaveBeenCalledWith({ id: ITEM, userId: USER });
    });

    it("returns 404 for a missing item or someone else's item", async () => {
      items.findOneBy.mockResolvedValue(null);

      await expect(service.findOne(USER, ITEM)).rejects.toEqual(
        new NotFoundException(ITEM_NOT_FOUND),
      );
    });
  });

  describe('create', () => {
    it('stores the snapshot fetched from TMDB and emits a created event', async () => {
      items.existsBy.mockResolvedValue(false);
      tmdb.getMovie.mockResolvedValue(dune);

      const view = await service.create(USER, { tmdbId: 438631 });

      expect(tmdb.getMovie).toHaveBeenCalledWith(438631);
      expect(items.create).toHaveBeenCalledWith({
        userId: USER,
        ...dune,
        syncedAt: expect.any(Date),
        watched: false,
        watchedAt: null,
        rating: null,
        priority: WatchPriority.Medium,
      });
      expect(view).toMatchObject({ id: ITEM, title: 'Dune', watched: false });
      expect(events.emit).toHaveBeenCalledWith(
        WATCHLIST_ITEM_CREATED,
        new WatchlistItemCreatedEvent(ITEM, USER, 438631, 'Dune'),
      );
    });

    it('uses the priority from the request', async () => {
      items.existsBy.mockResolvedValue(false);
      tmdb.getMovie.mockResolvedValue(dune);

      await service.create(USER, {
        tmdbId: 438631,
        priority: WatchPriority.High,
      });

      expect(items.create).toHaveBeenCalledWith(
        expect.objectContaining({ priority: WatchPriority.High }),
      );
    });

    it('rejects a movie already on the list with 409, before calling TMDB', async () => {
      items.existsBy.mockResolvedValue(true);

      await expect(
        service.create(USER, { tmdbId: 438631 }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(items.existsBy).toHaveBeenCalledWith({
        userId: USER,
        tmdbId: 438631,
      });
      expect(tmdb.getMovie).not.toHaveBeenCalled();
      expect(items.save).not.toHaveBeenCalled();
    });

    it('passes a TMDB 404 through and saves nothing', async () => {
      items.existsBy.mockResolvedValue(false);
      tmdb.getMovie.mockRejectedValue(new NotFoundException('Movie not found'));

      await expect(service.create(USER, { tmdbId: 1 })).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(items.save).not.toHaveBeenCalled();
      expect(events.emit).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('rejects an empty update without touching the database', async () => {
      await expect(service.update(USER, ITEM, {})).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(items.findOneBy).not.toHaveBeenCalled();
    });

    it("returns 404 for a missing item or someone else's item", async () => {
      items.findOneBy.mockResolvedValue(null);

      await expect(
        service.update(USER, ITEM, { watched: true }),
      ).rejects.toEqual(new NotFoundException(ITEM_NOT_FOUND));
      expect(items.findOneBy).toHaveBeenCalledWith({ id: ITEM, userId: USER });
    });

    it('sets watchedAt when watched becomes true', async () => {
      items.findOneBy.mockResolvedValue(storedItem());

      const view = await service.update(USER, ITEM, { watched: true });

      expect(view.watched).toBe(true);
      expect(view.watchedAt).toBeInstanceOf(Date);
    });

    it('clears watchedAt when watched becomes false', async () => {
      items.findOneBy.mockResolvedValue(
        storedItem({ watched: true, watchedAt: T0 }),
      );

      const view = await service.update(USER, ITEM, { watched: false });

      expect(view).toMatchObject({ watched: false, watchedAt: null });
    });

    it('keeps the original watchedAt when watched is set to true again', async () => {
      items.findOneBy.mockResolvedValue(
        storedItem({ watched: true, watchedAt: T0 }),
      );

      const view = await service.update(USER, ITEM, { watched: true });

      expect(view.watchedAt).toBe(T0);
    });

    it('sets a rating, clears it with null, and leaves it alone when omitted', async () => {
      items.findOneBy.mockResolvedValueOnce(storedItem());
      expect((await service.update(USER, ITEM, { rating: 9 })).rating).toBe(9);

      items.findOneBy.mockResolvedValueOnce(storedItem({ rating: 9 }));
      expect(
        (await service.update(USER, ITEM, { rating: null })).rating,
      ).toBeNull();

      items.findOneBy.mockResolvedValueOnce(storedItem({ rating: 9 }));
      const view = await service.update(USER, ITEM, {
        priority: WatchPriority.Low,
      });
      expect(view).toMatchObject({ rating: 9, priority: WatchPriority.Low });
    });
  });

  describe('remove', () => {
    it("deletes by id AND the caller's id", async () => {
      items.delete.mockResolvedValue({ affected: 1 });

      await expect(service.remove(USER, ITEM)).resolves.toBeUndefined();
      expect(items.delete).toHaveBeenCalledWith({ id: ITEM, userId: USER });
    });

    it("returns 404 when nothing was deleted (missing or someone else's)", async () => {
      items.delete.mockResolvedValue({ affected: 0 });

      await expect(service.remove(USER, ITEM)).rejects.toEqual(
        new NotFoundException(ITEM_NOT_FOUND),
      );
    });
  });
});
