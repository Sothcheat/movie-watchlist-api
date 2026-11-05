import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { IsNull, MoreThan, Repository } from 'typeorm';
import type { AuthUser } from '../common/types/auth-user.type.js';
import type { Env } from '../config/env.schema.js';
import { UsersService } from '../users/users.service.js';
import { PasswordService } from './password.service.js';
import { RefreshToken } from './refresh-token.entity.js';
import type {
  AccessTokenPayload,
  RefreshPrincipal,
  RefreshTokenPayload,
  TokenPair,
} from './auth.types.js';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly users: UsersService,
    private readonly passwords: PasswordService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokens: Repository<RefreshToken>,
  ) {}

  /** Always hashes first, so a taken email costs the same time as a new one. */
  async register(email: string, password: string): Promise<void> {
    const passwordHash = await this.passwords.hash(password);
    await this.users.createIfAbsent(email, passwordHash);
  }

  /** Returns null for a wrong password and for an unknown email alike, after the same work. */
  async validateCredentials(
    email: string,
    password: string,
  ): Promise<AuthUser | null> {
    const user = await this.users.findByEmailWithPassword(
      email.trim().toLowerCase(),
    );
    if (!user) {
      await this.passwords.verifyAgainstDummy(password);
      return null;
    }
    if (!(await this.passwords.verify(user.passwordHash, password))) {
      return null;
    }
    return { id: user.id, role: user.role };
  }

  /** A login starts a new refresh-token family. */
  login(user: AuthUser): Promise<TokenPair> {
    return this.issueTokens(user, randomUUID());
  }

  /**
   * Exchanges a refresh token for a new pair. The single conditional UPDATE claims the token
   * atomically, so two concurrent refreshes with the same token can't both succeed.
   */
  async rotate(principal: RefreshPrincipal): Promise<TokenPair> {
    const claimed = await this.refreshTokens.update(
      {
        id: principal.jti,
        userId: principal.id,
        familyId: principal.familyId,
        usedAt: IsNull(),
        revokedAt: IsNull(),
        expiresAt: MoreThan(new Date()),
      },
      { usedAt: new Date() },
    );

    if (claimed.affected !== 1) {
      await this.revokeFamilyOnReuse(principal.jti);
      throw new UnauthorizedException();
    }

    const user = await this.users.findById(principal.id);
    if (!user) {
      throw new UnauthorizedException();
    }
    return this.issueTokens(
      { id: user.id, role: user.role },
      principal.familyId,
    );
  }

  async logout(principal: RefreshPrincipal): Promise<void> {
    await this.revokeFamily(principal.familyId);
  }

  private async issueTokens(
    user: AuthUser,
    familyId: string,
  ): Promise<TokenPair> {
    const jti = randomUUID();
    const refreshTtl = this.config.get('JWT_REFRESH_TTL', { infer: true });

    await this.refreshTokens.insert({
      id: jti,
      userId: user.id,
      familyId,
      expiresAt: new Date(Date.now() + refreshTtl * 1000),
    });

    const accessPayload: AccessTokenPayload = { sub: user.id, role: user.role };
    const refreshPayload: RefreshTokenPayload = { sub: user.id, fam: familyId };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(accessPayload, {
        secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
        expiresIn: this.config.get('JWT_ACCESS_TTL', { infer: true }),
        algorithm: 'HS256',
      }),
      this.jwt.signAsync(refreshPayload, {
        secret: this.config.get('JWT_REFRESH_SECRET', { infer: true }),
        expiresIn: refreshTtl,
        algorithm: 'HS256',
        jwtid: jti,
      }),
    ]);
    return { accessToken, refreshToken };
  }

  /** A token that exists but was already used has been replayed: kill the whole family. */
  private async revokeFamilyOnReuse(jti: string): Promise<void> {
    const token = await this.refreshTokens.findOneBy({ id: jti });
    if (token?.usedAt) {
      await this.revokeFamily(token.familyId);
      this.logger.warn(
        `Refresh token reuse detected: revoked family ${token.familyId} of user ${token.userId}`,
      );
    }
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.refreshTokens.update(
      { familyId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }
}
