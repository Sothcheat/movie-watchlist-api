import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { IsNull } from 'typeorm';
import { UserRole } from '../users/user.entity.js';
import { UsersService } from '../users/users.service.js';
import { AuthService } from './auth.service.js';
import type { RefreshPrincipal, TokenPair } from './auth.types.js';
import { PasswordService } from './password.service.js';
import { RefreshToken } from './refresh-token.entity.js';

const env = {
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'r'.repeat(32),
  JWT_ACCESS_TTL: 900,
  JWT_REFRESH_TTL: 604800,
} as const;

const user = {
  id: '7c1e6c2a-4c5e-4b8f-9f0a-1a2b3c4d5e6f',
  role: UserRole.User,
};

describe('AuthService', () => {
  let service: AuthService;
  const jwt = new JwtService();
  const users = {
    findByEmailWithPassword: vi.fn(),
    findById: vi.fn(),
    createIfAbsent: vi.fn(),
  };
  const passwords = {
    hash: vi.fn(),
    verify: vi.fn(),
    verifyAgainstDummy: vi.fn(),
  };
  const refreshTokens = {
    insert: vi.fn(),
    update: vi.fn(),
    findOneBy: vi.fn(),
  };

  /** What the refresh strategy would put on request.user for this token. */
  async function principalFrom(
    refreshToken: string,
  ): Promise<RefreshPrincipal> {
    const payload = await jwt.verifyAsync<{
      sub: string;
      fam: string;
      jti: string;
    }>(refreshToken, { secret: env.JWT_REFRESH_SECRET });
    return { id: payload.sub, jti: payload.jti, familyId: payload.fam };
  }

  beforeEach(async () => {
    vi.resetAllMocks();
    passwords.hash.mockResolvedValue('argon2-hash');
    passwords.verifyAgainstDummy.mockResolvedValue(false);

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: users },
        { provide: PasswordService, useValue: passwords },
        { provide: JwtService, useValue: jwt },
        {
          provide: ConfigService,
          useValue: { get: (key: keyof typeof env) => env[key] },
        },
        { provide: getRepositoryToken(RefreshToken), useValue: refreshTokens },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  describe('register', () => {
    it('hashes the password before inserting, whether or not the email exists', async () => {
      await service.register('new@example.com', 'correct horse battery');

      expect(passwords.hash).toHaveBeenCalledWith('correct horse battery');
      expect(users.createIfAbsent).toHaveBeenCalledWith(
        'new@example.com',
        'argon2-hash',
      );
    });
  });

  describe('validateCredentials', () => {
    it('runs a dummy verification for an unknown email and returns null', async () => {
      users.findByEmailWithPassword.mockResolvedValue(null);

      await expect(
        service.validateCredentials(
          '  Nobody@Example.com ',
          'whatever-password',
        ),
      ).resolves.toBeNull();
      expect(users.findByEmailWithPassword).toHaveBeenCalledWith(
        'nobody@example.com',
      );
      expect(passwords.verifyAgainstDummy).toHaveBeenCalledWith(
        'whatever-password',
      );
    });

    it('returns null for a wrong password', async () => {
      users.findByEmailWithPassword.mockResolvedValue({
        ...user,
        passwordHash: 'h',
      });
      passwords.verify.mockResolvedValue(false);

      await expect(
        service.validateCredentials('a@example.com', 'wrong-password'),
      ).resolves.toBeNull();
      expect(passwords.verifyAgainstDummy).not.toHaveBeenCalled();
    });

    it('returns only id and role for valid credentials', async () => {
      users.findByEmailWithPassword.mockResolvedValue({
        ...user,
        email: 'a@example.com',
        passwordHash: 'h',
      });
      passwords.verify.mockResolvedValue(true);

      await expect(
        service.validateCredentials('a@example.com', 'right-password'),
      ).resolves.toEqual(user);
    });
  });

  describe('login', () => {
    let tokens: TokenPair;

    beforeEach(async () => {
      tokens = await service.login(user);
    });

    it('signs the access token with the access secret only', async () => {
      const payload = await jwt.verifyAsync<{
        sub: string;
        role: string;
        exp: number;
        iat: number;
      }>(tokens.accessToken, {
        secret: env.JWT_ACCESS_SECRET,
        algorithms: ['HS256'],
      });
      expect(payload).toMatchObject({ sub: user.id, role: 'user' });
      expect(payload.exp - payload.iat).toBe(env.JWT_ACCESS_TTL);

      await expect(
        jwt.verifyAsync(tokens.accessToken, { secret: env.JWT_REFRESH_SECRET }),
      ).rejects.toThrow();
    });

    it('stores only the refresh token jti, in a new family', async () => {
      const principal = await principalFrom(tokens.refreshToken);

      expect(refreshTokens.insert).toHaveBeenCalledWith({
        id: principal.jti,
        userId: user.id,
        familyId: principal.familyId,
        expiresAt: expect.any(Date),
      });
      await expect(
        jwt.verifyAsync(tokens.refreshToken, { secret: env.JWT_ACCESS_SECRET }),
      ).rejects.toThrow();
    });
  });

  describe('rotate', () => {
    let principal: RefreshPrincipal;

    beforeEach(async () => {
      principal = await principalFrom((await service.login(user)).refreshToken);
      refreshTokens.insert.mockClear();
    });

    it('claims an unused token atomically and issues a new pair in the same family', async () => {
      refreshTokens.update.mockResolvedValue({ affected: 1 });
      users.findById.mockResolvedValue(user);

      const next = await principalFrom(
        (await service.rotate(principal)).refreshToken,
      );

      expect(refreshTokens.update).toHaveBeenCalledWith(
        {
          id: principal.jti,
          userId: user.id,
          familyId: principal.familyId,
          usedAt: IsNull(),
          revokedAt: IsNull(),
          expiresAt: expect.anything(),
        },
        { usedAt: expect.any(Date) },
      );
      expect(next.familyId).toBe(principal.familyId);
      expect(next.jti).not.toBe(principal.jti);
      expect(refreshTokens.insert).toHaveBeenCalledTimes(1);
    });

    it('revokes the whole family when an already-used token is presented', async () => {
      refreshTokens.update.mockResolvedValue({ affected: 0 });
      refreshTokens.findOneBy.mockResolvedValue({
        id: principal.jti,
        userId: user.id,
        familyId: principal.familyId,
        usedAt: new Date(),
      });

      await expect(service.rotate(principal)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(refreshTokens.update).toHaveBeenLastCalledWith(
        { familyId: principal.familyId, revokedAt: IsNull() },
        { revokedAt: expect.any(Date) },
      );
      expect(refreshTokens.insert).not.toHaveBeenCalled();
    });

    it('rejects an unknown or expired token without revoking anything', async () => {
      refreshTokens.update.mockResolvedValue({ affected: 0 });
      refreshTokens.findOneBy.mockResolvedValue(null);

      await expect(service.rotate(principal)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(refreshTokens.update).toHaveBeenCalledTimes(1);
      expect(refreshTokens.insert).not.toHaveBeenCalled();
    });

    it('rejects a valid token whose user no longer exists', async () => {
      refreshTokens.update.mockResolvedValue({ affected: 1 });
      users.findById.mockResolvedValue(null);

      await expect(service.rotate(principal)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(refreshTokens.insert).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('revokes every live token in the family', async () => {
      await service.logout({ id: user.id, jti: 'j', familyId: 'family-1' });

      expect(refreshTokens.update).toHaveBeenCalledWith(
        { familyId: 'family-1', revokedAt: IsNull() },
        { revokedAt: expect.any(Date) },
      );
    });
  });
});
