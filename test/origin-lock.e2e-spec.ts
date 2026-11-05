import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PASSWORD } from './helpers/auth.js';
import { createTestApp } from './helpers/test-app.js';

// Hoisted above the imports: ConfigModule reads process.env when AppModule is first imported.
const SECRET = vi.hoisted(() => {
  const secret = 'e2e-origin-secret-0123456789abcdef0123456789';
  vi.stubEnv('ORIGIN_SECRET', secret);
  return secret;
});

/** With ORIGIN_SECRET set, as on Render: only requests from the Vercel proxy get in. */
describe('Origin lock (e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    ({ app } = await createTestApp({ realThrottling: true }));
  });

  afterAll(async () => {
    await app.close();
    vi.unstubAllEnvs();
  });

  it('refuses a request without the header', async () => {
    const res = await http().get('/api/movies/search?query=dune').expect(403);

    expect(res.body).toEqual({ statusCode: 403, message: 'Forbidden' });
  });

  it('refuses a wrong secret', async () => {
    await http()
      .get('/api/movies/search?query=dune')
      .set('x-origin-secret', 'not-the-secret')
      .expect(403);
  });

  it('lets the right secret through', async () => {
    await http()
      .get('/api/movies/search?query=dune')
      .set('x-origin-secret', SECRET)
      .expect(200);
  });

  it('answers the health check without the secret, for Render', async () => {
    await http().get('/api/health').expect(200, { status: 'ok' });
  });

  it('rate-limits each visitor by x-vercel-forwarded-for, not by the proxy address', async () => {
    const login = (visitor: string) =>
      http()
        .post('/api/auth/login')
        .set('x-origin-secret', SECRET)
        .set('x-vercel-forwarded-for', visitor)
        .send({ email: 'nobody@example.com', password: PASSWORD });

    for (let attempt = 1; attempt <= 5; attempt++) {
      await login('203.0.113.7').expect(401);
    }
    await login('203.0.113.7').expect(429);

    await login('198.51.100.4').expect(401);
  });
});
