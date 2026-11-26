import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppLogger } from '../common/logger/app-logger.service';
import { ALLOW_PENDING_KEY, AuthUser, IS_PUBLIC_KEY } from './decorators';

export type PendingStep = 'PASSWORD_CHANGE' | 'ONBOARDING' | 'COMPANY_SETUP';

/**
 * Paso obligatorio que bloquea a la cuenta (SWR-ONB-001). El backend lo exige,
 * no solo la interfaz. Orden: primero cambiar la contraseña temporal, luego la
 * configuración inicial (solo el ADMIN la completa; el vendedor espera).
 */
export function pendingStep(
  user: Pick<AuthUser, 'role' | 'mustChangePassword' | 'onboardingCompleted'>,
): PendingStep | null {
  if (user.mustChangePassword) return 'PASSWORD_CHANGE';
  if (user.role === 'SUPER_ADMIN' || user.onboardingCompleted !== false)
    return null;
  return user.role === 'ADMIN' ? 'ONBOARDING' : 'COMPANY_SETUP';
}

const MESSAGES: Record<PendingStep, string> = {
  PASSWORD_CHANGE: 'Debe cambiar la contraseña temporal antes de continuar',
  ONBOARDING:
    'Debe completar la configuración inicial de la empresa antes de continuar',
  COMPANY_SETUP:
    'La empresa aún no termina su configuración inicial. Contacte al administrador',
};

/** Rutas permitidas según el paso pendiente (además de las marcadas con @AllowPending). */
const ONBOARDING_PATHS = /^\/company(\/|$)/;

@Injectable()
export class PendingStepsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly logger: AppLogger,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets))
      return true;
    const req = context
      .switchToHttp()
      .getRequest<{ user?: AuthUser; method: string; path: string }>();
    if (!req.user) return true;

    const step = pendingStep(req.user);
    if (!step) return true;
    if (this.reflector.getAllAndOverride<boolean>(ALLOW_PENDING_KEY, targets))
      return true;
    if (step === 'ONBOARDING' && ONBOARDING_PATHS.test(req.path)) return true;

    this.logger.warn(
      'PendingStepsGuard',
      'AUTHZ_DENIED',
      'Paso obligatorio pendiente',
      {
        reason: step,
        userId: req.user.userId,
        method: req.method,
        path: req.path,
      },
    );
    // 428 Precondition Required: la interfaz sabe a qué pantalla llevar al usuario.
    throw new HttpException(
      { statusCode: 428, message: MESSAGES[step], pendingStep: step },
      HttpStatus.PRECONDITION_REQUIRED,
    );
  }
}
