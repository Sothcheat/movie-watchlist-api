import type { INestApplication } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { WATCHLIST_ITEM_CREATED } from '../src/watchlist/events/watchlist-item-created.event.js';
import { bearer, type Session, signUp } from './helpers/auth.js';
import { DUNE, DUNE_PART_TWO, THE_MATRIX } from './helpers/fake-tmdb.js';
import { createTestApp, resetDatabase } from './helpers/test-app.js';

const MISSING_ID = '00000000-0000-4000-8000-000000000000';

describe('Watchlist (e2e)', () => {
  let app: INestApplication;
  let db: DataSource;
  let alice: Session;
  let bob: Session;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    ({ app, db } = await createTestApp());
  });

  beforeEach(async () => {
    await resetDatabase(db);
    alice = await signUp(app, 'alice');
    bob = await signUp(app, 'bob');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  const add = async (session: Session, tmdbId: number, priority?: string) => {
    const res = await http()
      .post('/watchlist')
      .set(...bearer(session))
      .send({ tmdbId, priority })
      .expect(201);
    return res.body as { id: string };
  };

  describe('authentication (checklist 6)', () => {
    it.each([
      ['GET', '/watchlist'],
      ['GET', `/watchlist/${MISSING_ID}`],
      ['POST', '/watchlist'],
      ['PATCH', `/watchlist/${MISSING_ID}`],
      ['DELETE', `/watchlist/${MISSING_ID}`],
    ] as const)('%s %s returns 401 without a token', async (method, path) => {
      const req =
        http()[method.toLowerCase() as 'get' | 'post' | 'patch' | 'delete'](
          path,
        );
      await (
        method === 'GET' || method === 'DELETE'
          ? req
          : req.send({ tmdbId: DUNE.tmdbId, watched: true })
      ).expect(401);
    });

    it('returns 401 for an invalid token and does not touch the database', async () => {
      await http()
        .post('/watchlist')
        .set('Authorization', 'Bearer not.a.jwt')
        .send({ tmdbId: DUNE.tmdbId })
        .expect(401);

      expect(await db.query('SELECT 1 FROM watchlist_items')).toHaveLength(0);
    });
  });

  describe('POST /watchlist', () => {
    it('saves the snapshot fetched from TMDB and returns 201', async () => {
      const emit = vi.spyOn(app.get(EventEmitter2), 'emit');

      const res = await http()
        .post('/watchlist')
        .set(...bearer(alice))
        .send({ tmdbId: DUNE.tmdbId })
        .expect(201);

      expect(res.body).toEqual({
        id: expect.any(String),
        ...DUNE,
        watched: false,
        watchedAt: null,
        rating: null,
        priority: 'medium',
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });
      expect(res.body).not.toHaveProperty('userId');
      expect(res.body).not.toHaveProperty('syncedAt');

      // ::text, because the raw pg driver would turn a date into a timezone-shifted Date.
      const [row] = await db.query(
        'SELECT title, release_date::text AS release_date, synced_at FROM watchlist_items',
      );
      expect(row.title).toBe('Dune');
      expect(row.release_date).toBe('2021-09-15');
      expect(row.synced_at).toBeInstanceOf(Date);

      expect(emit).toHaveBeenCalledWith(
        WATCHLIST_ITEM_CREATED,
        expect.objectContaining({
          itemId: res.body.id,
          tmdbId: DUNE.tmdbId,
          title: 'Dune',
        }),
      );
    });

    it('uses the requested priority', async () => {
      await http()
        .post('/watchlist')
        .set(...bearer(alice))
        .send({ tmdbId: DUNE_PART_TWO.tmdbId, priority: 'high' })
        .expect(201)
        .expect((res) => expect(res.body.priority).toBe('high'));
    });

    it('stores a movie with no poster or overview as nulls', async () => {
      const res = await http()
        .post('/watchlist')
        .set(...bearer(alice))
        .send({ tmdbId: THE_MATRIX.tmdbId })
        .expect(201);

      expect(res.body.posterPath).toBeNull();
      expect(res.body.overview).toBe(THE_MATRIX.overview);
    });

    it('returns 409 with a clear message for a movie already on the list', async () => {
      await add(alice, DUNE.tmdbId);

      const res = await http()
        .post('/watchlist')
        .set(...bearer(alice))
        .send({ tmdbId: DUNE.tmdbId })
        .expect(409);

      expect(res.body.message).toBe('Movie is already in your watchlist');
      expect(await db.query('SELECT 1 FROM watchlist_items')).toHaveLength(1);
    });

    it('lets the unique constraint settle two simultaneous adds: one 201, one 409', async () => {
      const send = () =>
        http()
          .post('/watchlist')
          .set(...bearer(alice))
          .send({ tmdbId: DUNE.tmdbId });

      const results = await Promise.all([send(), send()]);

      expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([
        201, 409,
      ]);
      expect(await db.query('SELECT 1 FROM watchlist_items')).toHaveLength(1);
    });

    it('lets two users add the same movie', async () => {
      await add(alice, DUNE.tmdbId);
      await add(bob, DUNE.tmdbId);

      expect(await db.query('SELECT 1 FROM watchlist_items')).toHaveLength(2);
    });

    it('returns 404 for a movie TMDB does not have, and saves nothing', async () => {
      const res = await http()
        .post('/watchlist')
        .set(...bearer(alice))
        .send({ tmdbId: 2147483647 })
        .expect(404);

      expect(res.body.message).toBe('Movie not found');
      expect(await db.query('SELECT 1 FROM watchlist_items')).toHaveLength(0);
    });

    it.each([
      ['an empty body (missing required field)', {}],
      ['tmdbId null', { tmdbId: null }],
      ['tmdbId as a string', { tmdbId: '438631' }],
      ['tmdbId 0', { tmdbId: 0 }],
      ['a fractional tmdbId', { tmdbId: 1.5 }],
      ['an unknown priority', { tmdbId: DUNE.tmdbId, priority: 'urgent' }],
      ['a forged title', { tmdbId: DUNE.tmdbId, title: 'Forged' }],
      [
        'a forged owner',
        { tmdbId: DUNE.tmdbId, userId: '00000000-0000-4000-8000-000000000001' },
      ],
      ['watched set on create', { tmdbId: DUNE.tmdbId, watched: true }],
    ])(
      'rejects %s with 400 and saves nothing (checklist 4)',
      async (_label, body) => {
        await http()
          .post('/watchlist')
          .set(...bearer(alice))
          .send(body)
          .expect(400);

        expect(await db.query('SELECT 1 FROM watchlist_items')).toHaveLength(0);
      },
    );
  });

  describe('GET /watchlist', () => {
    it('returns an empty page for a new user', async () => {
      const res = await http()
        .get('/watchlist')
        .set(...bearer(alice))
        .expect(200);

      expect(res.body).toEqual({ items: [], total: 0, page: 1, limit: 20 });
    });

    it("lists only the caller's items, newest first", async () => {
      await add(alice, DUNE.tmdbId);
      await add(alice, THE_MATRIX.tmdbId);
      await add(bob, DUNE_PART_TWO.tmdbId);

      const res = await http()
        .get('/watchlist')
        .set(...bearer(alice))
        .expect(200);

      expect(res.body.total).toBe(2);
      expect(res.body.items.map((i: { title: string }) => i.title)).toEqual([
        'The Matrix',
        'Dune',
      ]);
      const bobs = await http()
        .get('/watchlist')
        .set(...bearer(bob))
        .expect(200);
      expect(bobs.body.items.map((i: { title: string }) => i.title)).toEqual([
        'Dune: Part Two',
      ]);
    });

    it('paginates with page and limit', async () => {
      for (const movie of [DUNE, DUNE_PART_TWO, THE_MATRIX]) {
        await add(alice, movie.tmdbId);
      }

      const first = await http()
        .get('/watchlist?limit=2')
        .set(...bearer(alice))
        .expect(200);
      const second = await http()
        .get('/watchlist?limit=2&page=2')
        .set(...bearer(alice))
        .expect(200);

      expect(first.body).toMatchObject({ total: 3, page: 1, limit: 2 });
      expect(first.body.items).toHaveLength(2);
      expect(second.body).toMatchObject({ total: 3, page: 2, limit: 2 });
      expect(second.body.items).toHaveLength(1);
      const ids = [...first.body.items, ...second.body.items].map(
        (i: { id: string }) => i.id,
      );
      expect(new Set(ids).size).toBe(3); // no item repeated or skipped across pages
    });

    it('filters by priority and by watched (including watched=false)', async () => {
      const dune = await add(alice, DUNE.tmdbId, 'high');
      await add(alice, THE_MATRIX.tmdbId, 'low');
      await http()
        .patch(`/watchlist/${dune.id}`)
        .set(...bearer(alice))
        .send({ watched: true })
        .expect(200);

      const high = await http()
        .get('/watchlist?priority=high')
        .set(...bearer(alice));
      const watched = await http()
        .get('/watchlist?watched=true')
        .set(...bearer(alice));
      const unwatched = await http()
        .get('/watchlist?watched=false')
        .set(...bearer(alice));

      expect(high.body.items.map((i: { title: string }) => i.title)).toEqual([
        'Dune',
      ]);
      expect(watched.body.items.map((i: { title: string }) => i.title)).toEqual(
        ['Dune'],
      );
      expect(
        unwatched.body.items.map((i: { title: string }) => i.title),
      ).toEqual(['The Matrix']);
    });

    it.each([
      ['limit above 100', '?limit=101'],
      ['limit 0', '?limit=0'],
      ['page 0', '?page=0'],
      ['watched=yes', '?watched=yes'],
      ['an unknown priority', '?priority=urgent'],
      ['an unknown parameter such as userId', '?userId=someone'],
    ])('rejects %s with 400', async (_label, qs) => {
      await http()
        .get(`/watchlist${qs}`)
        .set(...bearer(alice))
        .expect(400);
    });
  });

  describe('GET /watchlist/:id', () => {
    it('returns the item', async () => {
      const { id } = await add(alice, DUNE.tmdbId);

      const res = await http()
        .get(`/watchlist/${id}`)
        .set(...bearer(alice))
        .expect(200);

      expect(res.body).toMatchObject({
        id,
        title: 'Dune',
        tmdbId: DUNE.tmdbId,
      });
    });

    it('returns 404 for an item that does not exist (checklist 5)', async () => {
      const res = await http()
        .get(`/watchlist/${MISSING_ID}`)
        .set(...bearer(alice))
        .expect(404);

      expect(res.body).toEqual({
        statusCode: 404,
        message: 'Watchlist item not found',
        error: 'Not Found',
      });
    });

    it('returns 400 for an id that is not a UUID', async () => {
      await http()
        .get('/watchlist/123')
        .set(...bearer(alice))
        .expect(400);
      await http()
        .get("/watchlist/1'%20OR%20'1'='1")
        .set(...bearer(alice))
        .expect(400);
    });

    it("returns 404, identical to a missing item, for another user's item", async () => {
      const { id } = await add(alice, DUNE.tmdbId);

      const res = await http()
        .get(`/watchlist/${id}`)
        .set(...bearer(bob))
        .expect(404);
      const missing = await http()
        .get(`/watchlist/${MISSING_ID}`)
        .set(...bearer(bob))
        .expect(404);

      expect(res.body).toEqual(missing.body);
    });
  });

  describe('PATCH /watchlist/:id', () => {
    it('sets watched, stamps watchedAt, and stores the rating and priority', async () => {
      const { id } = await add(alice, DUNE.tmdbId);

      const res = await http()
        .patch(`/watchlist/${id}`)
        .set(...bearer(alice))
        .send({ watched: true, rating: 9, priority: 'low' })
        .expect(200);

      expect(res.body).toMatchObject({
        watched: true,
        rating: 9,
        priority: 'low',
      });
      expect(new Date(res.body.watchedAt).getTime()).toBeGreaterThan(
        Date.now() - 60_000,
      );
    });

    it('clears watchedAt when watched goes back to false, and clears a rating with null', async () => {
      const { id } = await add(alice, DUNE.tmdbId);
      await http()
        .patch(`/watchlist/${id}`)
        .set(...bearer(alice))
        .send({ watched: true, rating: 8 });

      const res = await http()
        .patch(`/watchlist/${id}`)
        .set(...bearer(alice))
        .send({ watched: false, rating: null })
        .expect(200);

      expect(res.body).toMatchObject({
        watched: false,
        watchedAt: null,
        rating: null,
      });
    });

    it('keeps the first watchedAt when watched is set to true again, and leaves omitted fields alone', async () => {
      const { id } = await add(alice, DUNE.tmdbId);
      const first = await http()
        .patch(`/watchlist/${id}`)
        .set(...bearer(alice))
        .send({ watched: true, rating: 7 });

      const again = await http()
        .patch(`/watchlist/${id}`)
        .set(...bearer(alice))
        .send({ watched: true })
        .expect(200);

      expect(again.body.watchedAt).toBe(first.body.watchedAt);
      expect(again.body.rating).toBe(7);
    });

    it('never changes the TMDB snapshot', async () => {
      const { id } = await add(alice, DUNE.tmdbId);
      await http()
        .patch(`/watchlist/${id}`)
        .set(...bearer(alice))
        .send({ rating: 5 })
        .expect(200);

      const [row] = await db.query(
        'SELECT title, tmdb_id, poster_path FROM watchlist_items',
      );
      expect(row).toEqual({
        title: 'Dune',
        tmdb_id: DUNE.tmdbId,
        poster_path: '/dune.jpg',
      });
    });

    it.each([
      ['an empty body', {}],
      ['watched as a string', { watched: 'true' }],
      ['watched null', { watched: null }],
      ['rating 0', { rating: 0 }],
      ['rating 11', { rating: 11 }],
      ['a fractional rating', { rating: 7.5 }],
      ['rating as a string', { rating: '7' }],
      ['priority null', { priority: null }],
      ['an unknown priority', { priority: 'urgent' }],
      ['the title', { title: 'Edited' }],
      ['the tmdbId', { tmdbId: 1 }],
      ['the owner', { userId: '00000000-0000-4000-8000-000000000001' }],
    ])('rejects %s with 400 and changes nothing', async (_label, body) => {
      const { id } = await add(alice, DUNE.tmdbId);

      await http()
        .patch(`/watchlist/${id}`)
        .set(...bearer(alice))
        .send(body)
        .expect(400);

      const [row] = await db.query(
        'SELECT watched, rating, priority FROM watchlist_items',
      );
      expect(row).toEqual({ watched: false, rating: null, priority: 'medium' });
    });

    it('returns 404 for an item that does not exist (checklist 5)', async () => {
      await http()
        .patch(`/watchlist/${MISSING_ID}`)
        .set(...bearer(alice))
        .send({ watched: true })
        .expect(404);
    });

    it("returns 404 for another user's item and leaves it unchanged", async () => {
      const { id } = await add(alice, DUNE.tmdbId);

      await http()
        .patch(`/watchlist/${id}`)
        .set(...bearer(bob))
        .send({ rating: 1, watched: true })
        .expect(404);

      const [row] = await db.query(
        'SELECT watched, rating FROM watchlist_items WHERE id = $1',
        [id],
      );
      expect(row).toEqual({ watched: false, rating: null });
    });
  });

  describe('DELETE /watchlist/:id', () => {
    it('removes the item: 204, then 404 on every later access (checklist 5)', async () => {
      const { id } = await add(alice, DUNE.tmdbId);

      const res = await http()
        .delete(`/watchlist/${id}`)
        .set(...bearer(alice))
        .expect(204);

      expect(res.text).toBe('');
      await http()
        .get(`/watchlist/${id}`)
        .set(...bearer(alice))
        .expect(404);
      await http()
        .delete(`/watchlist/${id}`)
        .set(...bearer(alice))
        .expect(404);
      expect(await db.query('SELECT 1 FROM watchlist_items')).toHaveLength(0);
    });

    it("returns 404 for another user's item and keeps it", async () => {
      const { id } = await add(alice, DUNE.tmdbId);

      await http()
        .delete(`/watchlist/${id}`)
        .set(...bearer(bob))
        .expect(404);

      await http()
        .get(`/watchlist/${id}`)
        .set(...bearer(alice))
        .expect(200);
    });

    it('lets the user add the movie again afterwards', async () => {
      const { id } = await add(alice, DUNE.tmdbId);
      await http()
        .delete(`/watchlist/${id}`)
        .set(...bearer(alice))
        .expect(204);

      await add(alice, DUNE.tmdbId);
    });
  });

  describe('database constraints (the last line of defence)', () => {
    it('rejects a rating outside 1-10 even if the API is bypassed', async () => {
      await add(alice, DUNE.tmdbId);

      await expect(
        db.query('UPDATE watchlist_items SET rating = 11'),
      ).rejects.toThrow(/CHK_watchlist_items_rating/);
      await expect(
        db.query('UPDATE watchlist_items SET rating = 0'),
      ).rejects.toThrow();
    });

    it('rejects a duplicate (user, movie) pair', async () => {
      await add(alice, DUNE.tmdbId);

      await expect(
        db.query(
          `INSERT INTO watchlist_items (user_id, tmdb_id, title, synced_at)
           SELECT user_id, tmdb_id, title, synced_at FROM watchlist_items`,
        ),
      ).rejects.toThrow(/UQ_watchlist_items_user_movie/);
    });

    it("deletes a user's items and refresh tokens along with the user", async () => {
      await add(alice, DUNE.tmdbId);

      await db.query('DELETE FROM users WHERE email = $1', [alice.email]);

      const [{ items }] = await db.query(
        'SELECT count(*)::int AS items FROM watchlist_items',
      );
      const [{ tokens }] = await db.query(
        'SELECT count(*)::int AS tokens FROM refresh_tokens WHERE user_id NOT IN (SELECT id FROM users)',
      );
      expect(items).toBe(0);
      expect(tokens).toBe(0);
    });
  });

  describe('public movie routes and app-wide behaviour', () => {
    it('searches movies without a token', async () => {
      const res = await http().get('/movies/search?query=dune').expect(200);

      expect(res.body.totalResults).toBe(2);
      expect(res.body.results.map((m: { title: string }) => m.title)).toEqual([
        'Dune',
        'Dune: Part Two',
      ]);
    });

    it('returns one movie, 404 for an unknown one, and 400 for bad input, all without a token', async () => {
      await http().get(`/movies/${DUNE.tmdbId}`).expect(200, DUNE);
      await http().get('/movies/2147483647').expect(404);
      await http().get('/movies/abc').expect(400);
      await http().get('/movies/search').expect(400);
    });

    it('sends security headers and hides the framework', async () => {
      const res = await http().get('/movies/search?query=dune');

      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['strict-transport-security']).toBeDefined();
      expect(res.headers['x-powered-by']).toBeUndefined();
    });

    it('answers an unknown route with a JSON 404, without a stack trace', async () => {
      const res = await http()
        .get('/does-not-exist')
        .set(...bearer(alice))
        .expect(404);

      expect(res.body).toMatchObject({ statusCode: 404 });
      expect(res.text).not.toMatch(/at .*\(.*\.(js|ts):\d+/);
    });

    it('allows the configured CORS origin and no other', async () => {
      const allowed = await http()
        .options('/watchlist')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'POST');
      const denied = await http()
        .options('/watchlist')
        .set('Origin', 'http://evil.example')
        .set('Access-Control-Request-Method', 'POST');

      expect(allowed.headers['access-control-allow-origin']).toBe(
        'http://localhost:3000',
      );
      expect(denied.headers['access-control-allow-origin']).toBeUndefined();
    });
  });
});
