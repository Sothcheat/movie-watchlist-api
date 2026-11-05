import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { minutes, Throttle } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import type { AuthUser } from '../common/types/auth-user.type.js';
import type { Env } from '../config/env.schema.js';
import { UsersService } from '../users/users.service.js';
import { REFRESH_COOKIE, REFRESH_COOKIE_PATH } from './auth.constants.js';
import { AuthService } from './auth.service.js';
import type { RefreshPrincipal, TokenPair } from './auth.types.js';
import { RegisterDto } from './dto/register.dto.js';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard.js';
import { LocalAuthGuard } from './guards/local-auth.guard.js';

const AUTH_THROTTLE = { default: { limit: 5, ttl: minutes(1) } };

type RefreshRequest = Request & { user: RefreshPrincipal };

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Same 201 and body whether or not the email was already registered (no enumeration). */
  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('register')
  async register(@Body() dto: RegisterDto) {
    await this.auth.register(dto.email, dto.password);
    return { message: 'Registration received' };
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @UseGuards(LocalAuthGuard)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  async login(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.sendTokens(res, await this.auth.login(user));
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: minutes(1) } })
  @UseGuards(JwtRefreshGuard)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  async refresh(
    @Req() req: RefreshRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.sendTokens(res, await this.auth.rotate(req.user));
  }

  @Public()
  @UseGuards(JwtRefreshGuard)
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() req: RefreshRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logout(req.user);
    res.clearCookie(REFRESH_COOKIE, this.refreshCookieOptions());
  }

  @Get('me')
  async me(@CurrentUser('id') userId: string) {
    const user = await this.users.findById(userId);
    if (!user) {
      // Valid token for an account that no longer exists.
      throw new UnauthorizedException();
    }
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
    };
  }

  /** Refresh token goes in the cookie only; the access token goes in the body. */
  private sendTokens(res: Response, tokens: TokenPair) {
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
      ...this.refreshCookieOptions(),
      maxAge: this.config.get('JWT_REFRESH_TTL', { infer: true }) * 1000,
    });
    return {
      accessToken: tokens.accessToken,
      tokenType: 'Bearer',
      expiresIn: this.config.get('JWT_ACCESS_TTL', { infer: true }),
    };
  }

  /** clearCookie must get the same path/flags as the cookie it removes. */
  private refreshCookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.get('NODE_ENV', { infer: true }) === 'production',
      sameSite: 'strict',
      path: REFRESH_COOKIE_PATH,
    };
  }
}
