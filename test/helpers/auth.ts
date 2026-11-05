import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

export const PASSWORD = 'correct horse battery';

/** The `refresh_token=...` Set-Cookie line from a response (throws if absent). */
export function setCookieLine(res: request.Response): string {
  const lines = res.headers['set-cookie'] as unknown as string[] | undefined;
  const line = lines?.find((cookie) => cookie.startsWith('refresh_token='));
  if (!line) {
    throw new Error('response has no refresh_token cookie');
  }
  return line;
}

/** Just `refresh_token=<value>`, ready to send back in a Cookie header. */
export const cookieHeader = (setCookie: string): string =>
  setCookie.split(';')[0];

export interface Session {
  email: string;
  accessToken: string;
  /** Value for a Cookie header. */
  refreshCookie: string;
}

let counter = 0;

/** Registers a fresh user and logs in. */
export async function signUp(
  app: INestApplication,
  tag = 'user',
): Promise<Session> {
  const email = `${tag}-${Date.now()}-${counter++}@example.com`;
  await request(app.getHttpServer())
    .post('/auth/register')
    .send({ email, password: PASSWORD })
    .expect(201);
  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email, password: PASSWORD })
    .expect(200);
  return {
    email,
    accessToken: res.body.accessToken as string,
    refreshCookie: cookieHeader(setCookieLine(res)),
  };
}

export const bearer = (
  session: Pick<Session, 'accessToken'>,
): [string, string] => ['Authorization', `Bearer ${session.accessToken}`];
