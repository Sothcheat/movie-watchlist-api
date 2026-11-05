import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import type { AuthUser } from '../../common/types/auth-user.type.js';
import {
  EMAIL_MAX_LENGTH,
  INVALID_CREDENTIALS,
  LOCAL_STRATEGY,
  PASSWORD_MAX_LENGTH,
} from '../auth.constants.js';
import { AuthService } from '../auth.service.js';

/** Checks email + password on POST /auth/login. Runs as a guard, i.e. before any DTO validation. */
@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy, LOCAL_STRATEGY) {
  constructor(private readonly auth: AuthService) {
    super({ usernameField: 'email' });
  }

  async validate(email: unknown, password: unknown): Promise<AuthUser> {
    // The body isn't validated yet, so reject odd types and oversized input before argon2 runs.
    if (
      typeof email !== 'string' ||
      typeof password !== 'string' ||
      email.length > EMAIL_MAX_LENGTH ||
      password.length > PASSWORD_MAX_LENGTH
    ) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    const user = await this.auth.validateCredentials(email, password);
    if (!user) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    return user;
  }
}
