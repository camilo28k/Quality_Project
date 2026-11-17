import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { AppLogger } from '../common/logger/app-logger.service';
import { AuthUser, IS_PUBLIC_KEY } from './decorators';

/**
 * Motivo legible del rechazo de un token (MEJ-01). Nunca incluye el token.
 * passport-jwt entrega en `info` el error de jsonwebtoken o «No auth token».
 */
export function tokenRejectionReason(err: unknown, info: unknown): string {
  if (err instanceof Error) return err.name;
  if (info instanceof Error) {
    if (info.name === 'TokenExpiredError') return 'TOKEN_EXPIRED';
    if (info.name === 'JsonWebTokenError') return 'TOKEN_INVALID';
    if (/no auth token/i.test(info.message)) return 'TOKEN_MISSING';
    return info.name;
  }
  return 'USER_NOT_ALLOWED';
}

/** Exige sesión válida en toda ruta que no esté marcada con @Public(). */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private readonly reflector: Reflector,
    private readonly logger: AppLogger,
  ) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }

  /** Registra los rechazos (Shift Right, H-SR-02) antes de responder 401. */
  handleRequest<TUser = AuthUser>(
    err: unknown,
    user: TUser | false,
    info: unknown,
    context: ExecutionContext,
  ): TUser {
    if (err || !user) {
      const req = context
        .switchToHttp()
        .getRequest<{ method: string; path: string }>();
      this.logger.warn(
        'JwtAuthGuard',
        'AUTH_TOKEN_INVALID',
        'Solicitud rechazada por sesión no válida',
        {
          reason: tokenRejectionReason(err, info),
          method: req.method,
          path: req.path,
        },
      );
      throw new UnauthorizedException('Sesión no válida');
    }
    return user;
  }
}
