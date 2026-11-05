import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { minutes, Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { CreateWatchlistItemDto } from './dto/create-watchlist-item.dto.js';
import { ListWatchlistQueryDto } from './dto/list-watchlist-query.dto.js';
import { UpdateWatchlistItemDto } from './dto/update-watchlist-item.dto.js';
import { WatchlistService } from './watchlist.service.js';

/**
 * Every route needs a valid access token (the global JwtAuthGuard; nothing here is @Public),
 * and every operation is limited to the caller's own items.
 */
@ApiBearerAuth()
@Controller('watchlist')
export class WatchlistController {
  constructor(private readonly watchlist: WatchlistService) {}

  @Get()
  findAll(
    @CurrentUser('id') userId: string,
    @Query() query: ListWatchlistQueryDto,
  ) {
    return this.watchlist.findAll(userId, query);
  }

  @Get(':id')
  findOne(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.watchlist.findOne(userId, id);
  }

  /** Spends a TMDB request, so it gets the same tighter limit as the movie routes. */
  @Post()
  @Throttle({ default: { limit: 30, ttl: minutes(1) } })
  create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateWatchlistItemDto,
  ) {
    return this.watchlist.create(userId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWatchlistItemDto,
  ) {
    return this.watchlist.update(userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.watchlist.remove(userId, id);
  }
}
