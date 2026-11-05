import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { LessThan } from 'typeorm';
import {
  PURGE_BATCH_SIZE,
  RefreshTokenCleanupService,
} from './refresh-token-cleanup.service.js';
import { RefreshToken } from './refresh-token.entity.js';

const RETENTION_SECONDS = 7 * 86400;
const NOW = new Date('2026-11-05T03:00:00.000Z');
const CUTOFF = new Date('2026-10-29T03:00:00.000Z');

const ids = (count: number, prefix = 'id') =>
  Array.from({ length: count }, (_, i) => ({ id: `${prefix}-${i}` }));

describe('RefreshTokenCleanupService', () => {
  let service: RefreshTokenCleanupService;
  const refreshTokens = { find: vi.fn(), delete: vi.fn() };

  beforeEach(async () => {
    vi.resetAllMocks();
    // delete() reports as many rows as it was given ids
    refreshTokens.delete.mockImplementation((given: string[]) =>
      Promise.resolve({ affected: given.length }),
    );

    const moduleRef = await Test.createTestingModule({
      providers: [
        RefreshTokenCleanupService,
        { provide: getRepositoryToken(RefreshToken), useValue: refreshTokens },
        {
          provide: ConfigService,
          useValue: { get: () => RETENTION_SECONDS },
        },
      ],
    }).compile();

    service = moduleRef.get(RefreshTokenCleanupService);
  });

  describe('purgeExpired', () => {
    it('only looks at tokens that expired before now minus the retention window', async () => {
      refreshTokens.find.mockResolvedValue([]);

      await service.purgeExpired(NOW);

      expect(refreshTokens.find).toHaveBeenCalledWith({
        select: { id: true },
        where: { expiresAt: LessThan(CUTOFF) },
        take: PURGE_BATCH_SIZE,
      });
    });

    it('deletes nothing when no row is old enough', async () => {
      refreshTokens.find.mockResolvedValue([]);

      await expect(service.purgeExpired(NOW)).resolves.toBe(0);
      expect(refreshTokens.delete).not.toHaveBeenCalled();
    });

    it('deletes a partial batch in one statement and stops', async () => {
      refreshTokens.find.mockResolvedValueOnce(ids(3));

      await expect(service.purgeExpired(NOW)).resolves.toBe(3);
      expect(refreshTokens.delete).toHaveBeenCalledTimes(1);
      expect(refreshTokens.delete).toHaveBeenCalledWith([
        'id-0',
        'id-1',
        'id-2',
      ]);
      expect(refreshTokens.find).toHaveBeenCalledTimes(1);
    });

    it('keeps going in batches until a short batch comes back', async () => {
      refreshTokens.find
        .mockResolvedValueOnce(ids(PURGE_BATCH_SIZE, 'a'))
        .mockResolvedValueOnce(ids(PURGE_BATCH_SIZE, 'b'))
        .mockResolvedValueOnce(ids(7, 'c'));

      await expect(service.purgeExpired(NOW)).resolves.toBe(
        2 * PURGE_BATCH_SIZE + 7,
      );
      expect(refreshTokens.delete).toHaveBeenCalledTimes(3);
      expect(refreshTokens.find).toHaveBeenCalledTimes(3);
    });

    it('stops on an empty batch after a full one (exact multiple of the batch size)', async () => {
      refreshTokens.find
        .mockResolvedValueOnce(ids(PURGE_BATCH_SIZE))
        .mockResolvedValueOnce([]);

      await expect(service.purgeExpired(NOW)).resolves.toBe(PURGE_BATCH_SIZE);
      expect(refreshTokens.find).toHaveBeenCalledTimes(2);
    });
  });

  describe('handleCron', () => {
    let logSpy: ReturnType<typeof vi.spyOn>;
    let errorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      logSpy = vi
        .spyOn(Logger.prototype, 'log')
        .mockImplementation(() => undefined);
      errorSpy = vi
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('logs how many rows were purged', async () => {
      refreshTokens.find.mockResolvedValueOnce(ids(4));

      await service.handleCron();

      expect(logSpy).toHaveBeenCalledWith('Purged 4 expired refresh token(s)');
    });

    it("logs a failure instead of throwing, so tomorrow's run still happens", async () => {
      refreshTokens.find.mockRejectedValue(new Error('connection lost'));

      await expect(service.handleCron()).resolves.toBeUndefined();
      expect(errorSpy).toHaveBeenCalledWith(
        'Refresh token purge failed',
        expect.stringContaining('connection lost'),
      );
    });
  });
});
