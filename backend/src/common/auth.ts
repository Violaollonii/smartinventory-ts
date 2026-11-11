import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

export enum Role {
  Admin = 'admin',
  Staff = 'staff',
}

/** What we put inside the JWT and attach to `request.user`. */
export interface JwtPayload {
  sub: string;
  email: string;
  name: string;
  role: Role;
}

type AuthedRequest = Request & { user?: JwtPayload };

const IS_PUBLIC_KEY = 'isPublic';
const ROLES_KEY = 'roles';

/** Marks a route as reachable without a token (e.g. login). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Restricts a route (or a whole controller) to the given roles. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/** Injects the authenticated user into a controller method. */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): JwtPayload => {
  return ctx.switchToHttp().getRequest<AuthedRequest>().user as JwtPayload;
});

/**
 * Registered globally: every route requires a valid Bearer token unless it
 * is marked @Public(). Secure by default — a new route can't be left open
 * by forgetting a decorator.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (isPublic) return true;

    const request = ctx.switchToHttp().getRequest<AuthedRequest>();
    const [scheme, token] = request.headers.authorization?.split(' ') ?? [];
    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    try {
      request.user = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
    return true;
  }
}

/** Runs after JwtAuthGuard and enforces @Roles(). No @Roles() = any signed-in user. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const user = ctx.switchToHttp().getRequest<AuthedRequest>().user;
    if (!user || !required.includes(user.role)) {
      throw new ForbiddenException('You do not have permission to do this');
    }
    return true;
  }
}
