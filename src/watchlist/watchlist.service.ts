import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { TmdbService } from '../tmdb/tmdb.service.js';
import { CreateWatchlistItemDto } from './dto/create-watchlist-item.dto.js';
import { ListWatchlistQueryDto } from './dto/list-watchlist-query.dto.js';
import { UpdateWatchlistItemDto } from './dto/update-watchlist-item.dto.js';
import {
  WATCHLIST_ITEM_CREATED,
  WatchlistItemCreatedEvent,
} from './events/watchlist-item-created.event.js';
import { WatchlistItem, WatchPriority } from './watchlist-item.entity.js';
import {
  toView,
  type WatchlistItemView,
  type WatchlistPage,
} from './watchlist-item.view.js';

export const ITEM_NOT_FOUND = 'Watchlist item not found';

/**
 * Every query is scoped to the caller's userId. Another user's item is indistinguishable from
 * a missing one (404, not 403), so ids can't be probed.
 */
@Injectable()
export class WatchlistService {
  constructor(
    @InjectRepository(WatchlistItem)
    private readonly items: Repository<WatchlistItem>,
    private readonly tmdb: TmdbService,
    private readonly events: EventEmitter2,
  ) {}

  async findAll(
    userId: string,
    { page, limit, watched, priority }: ListWatchlistQueryDto,
  ): Promise<WatchlistPage> {
    // TypeORM 1.x throws on `undefined` in a where clause, so add only the filters given.
    const where: FindOptionsWhere<WatchlistItem> = { userId };
    if (watched !== undefined) {
      where.watched = watched;
    }
    if (priority !== undefined) {
      where.priority = priority;
    }

    const [rows, total] = await this.items.findAndCount({
      where,
      // id breaks ties so pages stay stable when two items share a timestamp.
      order: { createdAt: 'DESC', id: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items: rows.map(toView), total, page, limit };
  }

  async findOne(userId: string, id: string): Promise<WatchlistItemView> {
    return toView(await this.findOwned(userId, id));
  }

  async create(
    userId: string,
    dto: CreateWatchlistItemDto,
  ): Promise<WatchlistItemView> {
    // Checked first for a clear message and to save a TMDB call. A concurrent duplicate still
    // hits the unique constraint, which the exception filter turns into a 409 as well.
    if (await this.items.existsBy({ userId, tmdbId: dto.tmdbId })) {
      throw new ConflictException('Movie is already in your watchlist');
    }

    const movie = await this.tmdb.getMovie(dto.tmdbId);
    const item = await this.items.save(
      this.items.create({
        userId,
        tmdbId: movie.tmdbId,
        title: movie.title,
        overview: movie.overview,
        posterPath: movie.posterPath,
        releaseDate: movie.releaseDate,
        syncedAt: new Date(),
        watched: false,
        watchedAt: null,
        rating: null,
        priority: dto.priority ?? WatchPriority.Medium,
      }),
    );

    this.events.emit(
      WATCHLIST_ITEM_CREATED,
      new WatchlistItemCreatedEvent(item.id, userId, item.tmdbId, item.title),
    );
    return toView(item);
  }

  async update(
    userId: string,
    id: string,
    { watched, rating, priority }: UpdateWatchlistItemDto,
  ): Promise<WatchlistItemView> {
    if (
      watched === undefined &&
      rating === undefined &&
      priority === undefined
    ) {
      throw new BadRequestException(
        'Provide at least one of: watched, rating, priority',
      );
    }

    const item = await this.findOwned(userId, id);
    if (watched !== undefined && watched !== item.watched) {
      item.watched = watched;
      item.watchedAt = watched ? new Date() : null;
    }
    if (rating !== undefined) {
      item.rating = rating; // null clears it
    }
    if (priority !== undefined) {
      item.priority = priority;
    }
    return toView(await this.items.save(item));
  }

  async remove(userId: string, id: string): Promise<void> {
    const { affected } = await this.items.delete({ id, userId });
    if (!affected) {
      throw new NotFoundException(ITEM_NOT_FOUND);
    }
  }

  private async findOwned(userId: string, id: string): Promise<WatchlistItem> {
    const item = await this.items.findOneBy({ id, userId });
    if (!item) {
      throw new NotFoundException(ITEM_NOT_FOUND);
    }
    return item;
  }
}
