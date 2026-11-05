import {
  CanActivate,
  ExecutionContext,
  INestApplication,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { CommonModule } from '../common/common.module.js';
import { WatchPriority } from './watchlist-item.entity.js';
import { WatchlistController } from './watchlist.controller.js';
import { WatchlistService } from './watchlist.service.js';

const USER = '11111111-1111-4111-8111-111111111111';
const ITEM = '22222222-2222-4222-8222-222222222222';

/** Stands in for the JWT guard: every request is authenticated as USER. */
class FakeAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    context.switchToHttp().getRequest().user = { id: USER, role: 'user' };
    return true;
  }
}

describe('WatchlistController (validation and wiring)', () => {
  let app: INestApplication;
  const watchlist = {
    findAll: vi.fn(),
    findOne: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [CommonModule],
      controllers: [WatchlistController],
      providers: [
        { provide: WatchlistService, useValue: watchlist },
        { provide: APP_GUARD, useClass: FakeAuthGuard },
      ],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
  });

  beforeEach(() => {
    vi.resetAllMocks();
    for (const fn of Object.values(watchlist)) {
      fn.mockResolvedValue({});
    }
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  describe('GET /watchlist', () => {
    it('defaults to page 1, limit 20, no filters', async () => {
      await http().get('/watchlist').expect(200);

      const [userId, query] = watchlist.findAll.mock.calls[0];
      expect(userId).toBe(USER);
      expect(query).toMatchObject({ page: 1, limit: 20 });
      expect(query.watched).toBeUndefined();
      expect(query.priority).toBeUndefined();
    });

    it('parses watched=false as false (not truthy) and the other params', async () => {
      await http()
        .get('/watchlist?watched=false&priority=high&page=2&limit=50')
        .expect(200);

      expect(watchlist.findAll.mock.calls[0][1]).toMatchObject({
        watched: false,
        priority: WatchPriority.High,
        page: 2,
        limit: 50,
      });
    });

    it.each([
      ['limit over 100', '?limit=101'],
      ['limit 0', '?limit=0'],
      ['page 0', '?page=0'],
      ['watched=yes', '?watched=yes'],
      ['watched=1', '?watched=1'],
      ['an unknown priority', '?priority=urgent'],
      ['an unknown parameter', '?userId=someone-else'],
    ])('rejects %s with 400', async (_label, qs) => {
      await http().get(`/watchlist${qs}`).expect(400);
      expect(watchlist.findAll).not.toHaveBeenCalled();
    });
  });

  describe('GET /watchlist/:id', () => {
    it("passes the caller's id and the item id", async () => {
      await http().get(`/watchlist/${ITEM}`).expect(200);
      expect(watchlist.findOne).toHaveBeenCalledWith(USER, ITEM);
    });

    it('rejects an id that is not a UUID with 400', async () => {
      await http().get('/watchlist/123').expect(400);
      expect(watchlist.findOne).not.toHaveBeenCalled();
    });
  });

  describe('POST /watchlist', () => {
    it('creates with 201, using the id from the token', async () => {
      await http()
        .post('/watchlist')
        .send({ tmdbId: 438631, priority: 'high' })
        .expect(201);

      expect(watchlist.create).toHaveBeenCalledWith(USER, {
        tmdbId: 438631,
        priority: WatchPriority.High,
      });
    });

    it.each([
      ['an empty body', {}],
      ['tmdbId as a string', { tmdbId: '438631' }],
      ['tmdbId null', { tmdbId: null }],
      ['tmdbId 0', { tmdbId: 0 }],
      ['a fractional tmdbId', { tmdbId: 1.5 }],
      ['tmdbId above 32 bits', { tmdbId: 2147483648 }],
      ['an unknown priority', { tmdbId: 1, priority: 'urgent' }],
      ['a forged title', { tmdbId: 1, title: 'Not the real title' }],
      ['a different owner', { tmdbId: 1, userId: 'someone-else' }],
      ['watched on create', { tmdbId: 1, watched: true }],
    ])('rejects %s with 400', async (_label, body) => {
      await http().post('/watchlist').send(body).expect(400);
      expect(watchlist.create).not.toHaveBeenCalled();
    });
  });

  describe('PATCH /watchlist/:id', () => {
    it.each([
      [{ watched: true }],
      [{ rating: 1 }],
      [{ rating: 10 }],
      [{ rating: null }],
      [{ priority: 'low' }],
      [{ watched: false, rating: 7, priority: 'medium' }],
    ])('accepts %j', async (body) => {
      await http().patch(`/watchlist/${ITEM}`).send(body).expect(200);
      expect(watchlist.update).toHaveBeenCalledWith(USER, ITEM, body);
    });

    it.each([
      ['watched as a string', { watched: 'true' }],
      ['watched null', { watched: null }],
      ['rating 0', { rating: 0 }],
      ['rating 11', { rating: 11 }],
      ['a fractional rating', { rating: 7.5 }],
      ['rating as a string', { rating: '7' }],
      ['priority null', { priority: null }],
      ['an unknown priority', { priority: 'urgent' }],
      ['the TMDB title', { title: 'Edited' }],
      ['the tmdbId', { tmdbId: 1 }],
    ])('rejects %s with 400', async (_label, body) => {
      await http().patch(`/watchlist/${ITEM}`).send(body).expect(400);
      expect(watchlist.update).not.toHaveBeenCalled();
    });

    it('rejects an id that is not a UUID with 400', async () => {
      await http().patch('/watchlist/abc').send({ watched: true }).expect(400);
    });
  });

  describe('DELETE /watchlist/:id', () => {
    it('answers 204 with no body', async () => {
      const res = await http().delete(`/watchlist/${ITEM}`).expect(204);

      expect(res.text).toBe('');
      expect(watchlist.remove).toHaveBeenCalledWith(USER, ITEM);
    });

    it('rejects an id that is not a UUID with 400', async () => {
      await http().delete('/watchlist/abc').expect(400);
      expect(watchlist.remove).not.toHaveBeenCalled();
    });
  });
});
