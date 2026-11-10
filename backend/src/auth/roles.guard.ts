import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@prisma/client';
import { AppLogger } from '../common/logger/app-logger.service';
import { AuthUser, IS_PUBLIC_KEY, ROLES_KEY } from './decorators';

/**
 * Decisión de autorización (SWR-AUTH-004, SWR-SEC-003).
 * Separada del guard para analizarla en caja blanca.
 */
export function canAccess(
  requiredRoles: Role[] | undefined,
  userRole: Role | undefined,
): boolean {
  if (!requiredRoles || requiredRoles.length === 0) return true;
  if (!userRole) return false;
  return requiredRoles.includes(userRole);
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly logger: AppLogger,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets))
      return true;

    const required = this.reflector.getAllAndOverride<Role[] | undefined>(
      ROLES_KEY,
      targets,
    );
    const req = context
      .switchToHttp()
      .getRequest<{ user?: AuthUser; method: string; path: string }>();

    if (canAccess(required, req.user?.role)) return true;

    this.logger.warn('RolesGuard', 'AUTHZ_DENIED', 'Acceso denegado por rol', {
      userId: req.user?.userId,
      role: req.user?.role,
      required,
      method: req.method,
      path: req.path,
    });
    throw new ForbiddenException('No tiene permisos para esta operación');
  }
}
