import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { originSecretMiddleware } from './origin-secret.middleware.js';

const SECRET = 's'.repeat(40);

describe('originSecretMiddleware', () => {
  const middleware = originSecretMiddleware(SECRET);
  let res: { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
  let next: NextFunction;
  let warn: ReturnType<typeof vi.spyOn>;

  const run = (
    headers: Record<string, string> = {},
    method = 'GET',
    path = '/api/watchlist',
  ) =>
    middleware(
      { method, path, headers } as unknown as Request,
      res as unknown as Response,
      next,
    );

  beforeEach(() => {
    res = { status: vi.fn(), json: vi.fn() };
    res.status.mockReturnValue(res);
    next = vi.fn();
    warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lets a request with the right secret through', () => {
    run({ 'x-origin-secret': SECRET });

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it.each([
    ['no header', {}],
    ['a wrong secret', { 'x-origin-secret': 'wrong' }],
    ['the secret with extra characters', { 'x-origin-secret': `${SECRET}x` }],
  ])('answers 403 to %s', (_label, headers) => {
    run(headers);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      statusCode: 403,
      message: 'Forbidden',
    });
  });

  it('logs the method and path only, never the header', () => {
    run({ 'x-origin-secret': 'leaked-guess' }, 'POST', '/api/auth/login');

    expect(warn).toHaveBeenCalledOnce();
    const [line] = warn.mock.calls[0] as [string];
    expect(line).toMatch(/^POST \/api\/auth\/login 403 /);
    expect(line).not.toContain('leaked-guess');
  });

  it('lets GET /api/health through without the secret', () => {
    run({}, 'GET', '/api/health');

    expect(next).toHaveBeenCalledOnce();
  });

  it('only exempts GET on the health path', () => {
    run({}, 'POST', '/api/health');

    expect(res.status).toHaveBeenCalledWith(403);
  });
});
