import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser } from '../types/auth-user.type.js';

/**
 * Injects the authenticated user, or a single field of it: `@CurrentUser('id') userId: string`.
 * Only meaningful on routes behind the JWT guard.
 */
export const CurrentUser = createParamDecorator(
  (field: keyof AuthUser | undefined, ctx: ExecutionContext) => {
    const user = ctx
      .switchToHttp()
      .getRequest<Request & { user?: AuthUser }>().user;
    return field ? user?.[field] : user;
  },
);
