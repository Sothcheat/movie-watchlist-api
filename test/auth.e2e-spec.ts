import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import {
  bearer,
  cookieHeader,
  PASSWORD,
  setCookieLine,
  signUp,
} from './helpers/auth.js';
import { createTestApp, resetDatabase } from './helpers/test-app.js';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let db: DataSource;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    ({ app, db } = await createTestApp());
  });

  beforeEach(async () => {
    await resetDatabase(db);
  });

  afterAll(async () => {
    await app.close();
  });

  const userRows = (email: string) =>
    db.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);

  describe('POST /auth/register', () => {
    it('creates the user with an argon2id hash, never the plain password', async () => {
      await http()
        .post('/api/auth/register')
        .send({ email: 'New.User@Example.com', password: PASSWORD })
        .expect(201, { message: 'Registration received' });

      const [user] = await userRows('new.user@example.com');
      expect(user.email).toBe('new.user@example.com');
      expect(user.role).toBe('user');
      // OWASP minimum for Argon2id: 19 MiB memory, 2 iterations, 1 lane. node-argon2 writes
      // the parameters in the order m, p, t.
      expect(user.password_hash).toMatch(
        /^\$argon2id\$v=19\$m=19456,p=1,t=2\$/,
      );
      expect(user.password_hash).not.toContain(PASSWORD);
    });

    it('answers a duplicate email exactly like a new one and creates no second user', async () => {
      const body = { email: 'dup@example.com', password: PASSWORD };
      const first = await http()
        .post('/api/auth/register')
        .send(body)
        .expect(201);
      const second = await http()
        .post('/api/auth/register')
        .send({
          ...body,
          email: 'DUP@example.com',
          password: 'a different password',
        })
        .expect(201);

      expect(second.body).toEqual(first.body);
      expect(await userRows('dup@example.com')).toHaveLength(1);
      // The existing account keeps its original password.
      await http()
        .post('/api/auth/login')
        .send({ email: 'dup@example.com', password: PASSWORD })
        .expect(200);
    });

    it.each([
      [
        'a 7-character password',
        { email: 'a@example.com', password: 'a'.repeat(7) },
      ],
      [
        'a 129-character password',
        { email: 'a@example.com', password: 'a'.repeat(129) },
      ],
      ['a missing password', { email: 'a@example.com' }],
      ['an empty email', { email: '', password: PASSWORD }],
      ['an invalid email', { email: 'not-an-email', password: PASSWORD }],
      ['a numeric password', { email: 'a@example.com', password: 12345678 }],
      [
        'an extra role field',
        { email: 'a@example.com', password: PASSWORD, role: 'admin' },
      ],
    ])('rejects %s with 400 and creates nothing', async (_label, body) => {
      await http().post('/api/auth/register').send(body).expect(400);
      expect(await db.query('SELECT 1 FROM users')).toHaveLength(0);
    });

    it('accepts the boundary lengths 8 and 128', async () => {
      await http()
        .post('/api/auth/register')
        .send({ email: 'min@example.com', password: 'a'.repeat(8) })
        .expect(201);
      await http()
        .post('/api/auth/register')
        .send({ email: 'max@example.com', password: 'a'.repeat(128) })
        .expect(201);
    });
  });

  describe('POST /auth/login', () => {
    it('returns the access token in the body and the refresh token only in an HttpOnly cookie', async () => {
      await http()
        .post('/api/auth/register')
        .send({ email: 'login@example.com', password: PASSWORD })
        .expect(201);

      const res = await http()
        .post('/api/auth/login')
        .send({ email: 'LOGIN@example.com', password: PASSWORD })
        .expect(200);

      expect(res.body).toEqual({
        accessToken: expect.any(String),
        tokenType: 'Bearer',
        expiresIn: 900,
      });
      expect(res.headers['cache-control']).toBe('no-store');

      const cookie = setCookieLine(res);
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=Strict/i);
      expect(cookie).toMatch(/Path=\/api\/auth(;|$)/);
      expect(cookie).toMatch(/Max-Age=604800/i);
      expect(JSON.stringify(res.body)).not.toContain('refresh');
    });

    it('gives the same 401 for a wrong password and an unknown email', async () => {
      await http()
        .post('/api/auth/register')
        .send({ email: 'known@example.com', password: PASSWORD })
        .expect(201);

      const wrongPassword = await http()
        .post('/api/auth/login')
        .send({ email: 'known@example.com', password: 'not the password' })
        .expect(401);
      const unknownEmail = await http()
        .post('/api/auth/login')
        .send({ email: 'nobody@example.com', password: PASSWORD })
        .expect(401);

      expect(unknownEmail.body).toEqual(wrongPassword.body);
      expect(wrongPassword.body.message).toBe('Invalid email or password');
    });

    it.each([
      ['an empty body', {}],
      ['a numeric email', { email: 5, password: PASSWORD }],
      ['an object password', { email: 'a@example.com', password: { $ne: '' } }],
      [
        'a huge password (no argon2 DoS)',
        { email: 'a@example.com', password: 'a'.repeat(100_000) },
      ],
    ])('rejects %s with 401', async (_label, body) => {
      await http().post('/api/auth/login').send(body).expect(401);
    });
  });

  describe('access token', () => {
    const jwt = new JwtService();

    it('GET /auth/me needs a token and returns the profile without the hash', async () => {
      await http().get('/api/auth/me').expect(401);

      const session = await signUp(app, 'me');
      const res = await http()
        .get('/api/auth/me')
        .set(...bearer(session))
        .expect(200);

      expect(res.body).toEqual({
        id: expect.any(String),
        email: session.email,
        role: 'user',
        createdAt: expect.any(String),
      });
      expect(JSON.stringify(res.body)).not.toMatch(/password|hash/i);
    });

    it.each([
      ['garbage', async () => 'not.a.jwt'],
      [
        'an unsigned alg=none token',
        async () => {
          const b64 = (o: object) =>
            Buffer.from(JSON.stringify(o)).toString('base64url');
          return `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: 'x', role: 'user' })}.`;
        },
      ],
      [
        'a token signed with the refresh secret',
        () =>
          jwt.signAsync(
            { sub: 'x', role: 'user' },
            { secret: process.env.JWT_REFRESH_SECRET, expiresIn: 60 },
          ),
      ],
      [
        'an expired token',
        () =>
          jwt.signAsync(
            { sub: 'x', role: 'user', exp: Math.floor(Date.now() / 1000) - 60 },
            { secret: process.env.JWT_ACCESS_SECRET },
          ),
      ],
    ])('rejects %s with 401', async (_label, makeToken) => {
      await http()
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${await makeToken()}`)
        .expect(401);
    });

    it('rejects a refresh token used as an access token', async () => {
      const session = await signUp(app, 'swap');
      const token = session.refreshCookie.replace('refresh_token=', '');

      await http()
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);
    });

    it('rejects a valid token whose user has been deleted', async () => {
      const session = await signUp(app, 'gone');
      await db.query('DELETE FROM users WHERE email = $1', [session.email]);

      await http()
        .get('/api/auth/me')
        .set(...bearer(session))
        .expect(401);
    });
  });

  describe('POST /auth/refresh', () => {
    it('rotates: a new cookie and a working access token, and the old cookie stops working', async () => {
      const session = await signUp(app, 'rotate');

      const res = await http()
        .post('/api/auth/refresh')
        .set('Cookie', session.refreshCookie)
        .expect(200);

      const newCookie = cookieHeader(setCookieLine(res));
      expect(newCookie).not.toBe(session.refreshCookie);
      await http()
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${res.body.accessToken}`)
        .expect(200);
      await http()
        .post('/api/auth/refresh')
        .set('Cookie', newCookie)
        .expect(200);
    });

    it('treats a replayed token as theft and revokes the whole family', async () => {
      const session = await signUp(app, 'reuse');
      const rotated = await http()
        .post('/api/auth/refresh')
        .set('Cookie', session.refreshCookie)
        .expect(200);
      const newest = cookieHeader(setCookieLine(rotated));

      // An attacker replays the original, already-used token.
      await http()
        .post('/api/auth/refresh')
        .set('Cookie', session.refreshCookie)
        .expect(401);

      // The legitimate holder's newest token is dead too: the family is revoked.
      await http().post('/api/auth/refresh').set('Cookie', newest).expect(401);
      const [{ live }] = await db.query(
        'SELECT count(*)::int AS live FROM refresh_tokens WHERE revoked_at IS NULL',
      );
      expect(live).toBe(0);
    });

    it('lets only one of two simultaneous refreshes with the same token succeed', async () => {
      const session = await signUp(app, 'race');

      const results = await Promise.all([
        http().post('/api/auth/refresh').set('Cookie', session.refreshCookie),
        http().post('/api/auth/refresh').set('Cookie', session.refreshCookie),
      ]);

      expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([
        200, 401,
      ]);
    });

    it("does not touch another login's tokens when a family is revoked", async () => {
      const first = await signUp(app, 'multi');
      const secondLogin = await http()
        .post('/api/auth/login')
        .send({ email: first.email, password: PASSWORD })
        .expect(200);
      const second = cookieHeader(setCookieLine(secondLogin));

      await http()
        .post('/api/auth/logout')
        .set('Cookie', first.refreshCookie)
        .expect(204);

      await http()
        .post('/api/auth/refresh')
        .set('Cookie', first.refreshCookie)
        .expect(401);
      await http().post('/api/auth/refresh').set('Cookie', second).expect(200);
    });

    it.each([
      ['no cookie', undefined],
      ['an empty cookie', 'refresh_token='],
      ['a garbage cookie', 'refresh_token=not.a.jwt'],
    ])('rejects %s with 401', async (_label, cookie) => {
      const req = http().post('/api/auth/refresh');
      await (cookie ? req.set('Cookie', cookie) : req).expect(401);
    });

    it('rejects an access token placed in the refresh cookie', async () => {
      const session = await signUp(app, 'wrongcookie');

      await http()
        .post('/api/auth/refresh')
        .set('Cookie', `refresh_token=${session.accessToken}`)
        .expect(401);
    });

    it('rejects a valid refresh token whose database row has expired', async () => {
      const session = await signUp(app, 'expired');
      await db.query(
        "UPDATE refresh_tokens SET expires_at = now() - interval '1 minute'",
      );

      await http()
        .post('/api/auth/refresh')
        .set('Cookie', session.refreshCookie)
        .expect(401);
    });
  });

  describe('POST /auth/logout', () => {
    it('answers 204, clears the cookie, and revokes the refresh token', async () => {
      const session = await signUp(app, 'logout');

      const res = await http()
        .post('/api/auth/logout')
        .set('Cookie', session.refreshCookie)
        .expect(204);

      const cleared = setCookieLine(res);
      expect(cleared).toMatch(/^refresh_token=;/);
      expect(cleared).toMatch(/Path=\/api\/auth/);
      expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970/);
      await http()
        .post('/api/auth/refresh')
        .set('Cookie', session.refreshCookie)
        .expect(401);
    });

    it('needs a refresh cookie', async () => {
      await http().post('/api/auth/logout').expect(401);
    });
  });
});
