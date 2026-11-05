import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { Strategy } from 'passport-jwt';
import type { Env } from '../../config/env.schema.js';
import { JWT_REFRESH_STRATEGY, REFRESH_COOKIE } from '../auth.constants.js';
import type { RefreshPrincipal, RefreshTokenPayload } from '../auth.types.js';

function fromRefreshCookie(request: Request): string | null {
  const token: unknown = request.cookies?.[REFRESH_COOKIE];
  return typeof token === 'string' ? token : null;
}

/**
 * Verifies the refresh token from its HttpOnly cookie (signature, algorithm, expiry).
 * Whether it is still unused and unrevoked is checked against the database in AuthService.
 */
@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  JWT_REFRESH_STRATEGY,
) {
  constructor(config: ConfigService<Env, true>) {
    super({
      jwtFromRequest: fromRefreshCookie,
      secretOrKey: config.get('JWT_REFRESH_SECRET', { infer: true }),
      algorithms: ['HS256'],
      ignoreExpiration: false,
    });
  }

  validate(payload: RefreshTokenPayload): RefreshPrincipal {
    if (!payload.sub || !payload.fam || !payload.jti) {
      throw new UnauthorizedException();
    }
    return { id: payload.sub, jti: payload.jti, familyId: payload.fam };
  }
}
