import {
  Body,
  CanActivate,
  Controller,
  Get,
  INestApplication,
  Logger,
  NotFoundException,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { IsNotEmpty, IsString } from 'class-validator';
import request from 'supertest';
import { QueryFailedError } from 'typeorm';
import { CommonModule } from './common.module.js';

class EchoDto {
  @IsString()
  @IsNotEmpty()
  name: string;
}

class DenyGuard implements CanActivate {
  canActivate(): boolean {
    throw new UnauthorizedException();
  }
}

@Controller()
class ProbeController {
  @Get('guarded')
  @UseGuards(DenyGuard)
  guarded() {
    return 'unreachable';
  }

  @Post('echo')
  echo(@Body() dto: EchoDto) {
    return { name: dto.name };
  }

  @Get('missing')
  missing() {
    throw new NotFoundException('Thing not found');
  }

  @Get('duplicate')
  duplicate() {
    throw new QueryFailedError(
      'INSERT INTO "users" ...',
      [],
      Object.assign(
        new Error(
          'duplicate key value violates unique constraint "uq_users_email"',
        ),
        { code: '23505' },
      ),
    );
  }

  @Get('boom')
  boom() {
    throw new Error('connection to 10.0.0.5 failed, password=hunter2');
  }
}

describe('CommonModule', () => {
  let app: INestApplication;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [CommonModule],
      controllers: [ProbeController],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
  });

  beforeEach(() => {
    logSpy = vi
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    warnSpy = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    errorSpy = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('validation pipe', () => {
    it('accepts a valid body', async () => {
      await request(app.getHttpServer())
        .post('/echo')
        .send({ name: 'Dune' })
        .expect(201, { name: 'Dune' });
    });

    it.each([
      ['an empty required field', { name: '' }],
      ['a missing required field', {}],
      ['a non-string value', { name: 42 }],
    ])('rejects %s with 400', async (_label, body) => {
      await request(app.getHttpServer()).post('/echo').send(body).expect(400);
    });

    it('rejects properties that are not in the DTO instead of dropping them', async () => {
      const res = await request(app.getHttpServer())
        .post('/echo')
        .send({ name: 'Dune', role: 'admin' })
        .expect(400);

      expect(JSON.stringify(res.body)).toContain(
        'property role should not exist',
      );
    });
  });

  describe('exception filter', () => {
    it('passes HttpExceptions through with their status and message', async () => {
      const res = await request(app.getHttpServer())
        .get('/missing')
        .expect(404);

      expect(res.body).toEqual({
        statusCode: 404,
        message: 'Thing not found',
        error: 'Not Found',
      });
    });

    it('maps a Postgres unique violation to 409 without leaking the constraint', async () => {
      const res = await request(app.getHttpServer())
        .get('/duplicate')
        .expect(409);

      expect(res.body).toEqual({
        statusCode: 409,
        message: 'Resource already exists',
        error: 'Conflict',
      });
      expect(res.text).not.toContain('uq_users_email');
    });

    it('hides unexpected errors behind a generic 500 and logs them server-side', async () => {
      const res = await request(app.getHttpServer()).get('/boom').expect(500);

      expect(res.body).toEqual({
        statusCode: 500,
        message: 'Internal server error',
      });
      expect(res.text).not.toContain('hunter2');
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('password=hunter2'),
        expect.stringContaining('Error'),
      );
    });
  });

  describe('logging interceptor', () => {
    it('logs successful requests at info level, without query string or body', async () => {
      await request(app.getHttpServer())
        .post('/echo?token=abc123')
        .send({ name: 'hunter2' })
        .expect(201);

      await vi.waitFor(() => expect(logSpy).toHaveBeenCalled());
      const line = String(logSpy.mock.calls[0][0]);
      expect(line).toMatch(/^POST \/echo 201 \d+ms user=anonymous$/);
      expect(line).not.toContain('abc123');
      expect(line).not.toContain('hunter2');
    });

    // Wait for the interceptor's timed line (not just any line), then count: the filter
    // must not have logged the same request as well.
    const timedWarning = () =>
      warnSpy.mock.calls.some(([line]) => /\d+ms/.test(String(line)));

    it('logs client errors as warnings with the status the client received, once', async () => {
      await request(app.getHttpServer()).get('/missing').expect(404);

      await vi.waitFor(() => expect(timedWarning()).toBe(true));
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(String(warnSpy.mock.calls[0][0])).toMatch(
        /^GET \/missing 404 \d+ms user=anonymous$/,
      );
    });

    it('logs the status after the filter ran (409, not 500), once', async () => {
      await request(app.getHttpServer()).get('/duplicate').expect(409);

      await vi.waitFor(() => expect(timedWarning()).toBe(true));
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(String(warnSpy.mock.calls[0][0])).toContain('GET /duplicate 409');
    });
  });

  describe('requests that never reach a route handler', () => {
    it('logs a guard rejection (401) as a warning', async () => {
      await request(app.getHttpServer()).get('/guarded').expect(401);

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(
        'GET /guarded 401 (no handler reached) user=anonymous',
      );
    });

    it('logs an unmatched route (404) as a warning, without the query string', async () => {
      await request(app.getHttpServer())
        .get('/wp-admin.php?secret=abc')
        .expect(404);

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(
        'GET /wp-admin.php 404 (no handler reached) user=anonymous',
      );
    });
  });
});
