import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PASSWORD } from './helpers/auth.js';
import { createTestApp } from './helpers/test-app.js';

/**
 * The other e2e suites switch rate limiting off. This one keeps the real limiter. The app is
 * created once and every test uses a different route, so their counters never interfere.
 */
describe('Rate limiting (e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    ({ app } = await createTestApp({ realThrottling: true }));
  });

  afterAll(async () => {
    await app.close();
  });

  it('blocks the 6th login attempt within a minute, even with the right password', async () => {
    const body = { email: 'nobody@example.com', password: PASSWORD };

    for (let attempt = 1; attempt <= 5; attempt++) {
      await http().post('/auth/login').send(body).expect(401);
    }
    const blocked = await http().post('/auth/login').send(body).expect(429);

    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    expect(blocked.body.statusCode).toBe(429);
  });

  it('limits registration to 5 a minute per client', async () => {
    for (let i = 1; i <= 5; i++) {
      await http()
        .post('/auth/register')
        .send({ email: `limit-${i}@example.com`, password: PASSWORD })
        .expect(201);
    }

    await http()
      .post('/auth/register')
      .send({ email: 'limit-6@example.com', password: PASSWORD })
      .expect(429);
  });

  it('limits the public movie routes to 30 a minute, counting invalid requests too', async () => {
    for (let i = 1; i <= 30; i++) {
      await http().get('/movies/search?query=').expect(400);
    }

    await http().get('/movies/search?query=dune').expect(429);
  });

  it('applies the default 100 a minute everywhere else, before authentication runs', async () => {
    for (let i = 1; i <= 100; i++) {
      await http().get('/auth/me').expect(401);
    }

    await http().get('/auth/me').expect(429);
  });
});
