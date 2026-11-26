import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { AuthUser } from '../auth/decorators';
import { AppLogger } from '../common/logger/app-logger.service';
import { COMPANY_HEADER } from './tenant';

/**
 * Registra cada solicitud en la que el SUPER_ADMIN actúa dentro de una empresa
 * (diseño §4: toda acción de plataforma sobre una empresa queda trazada).
 * No decide acceso: la empresa se resuelve con @CompanyId().
 */
@Injectable()
export class TenantAccessGuard implements CanActivate {
  constructor(private readonly logger: AppLogger) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{
      user?: AuthUser;
      headers: Record<string, string | undefined>;
      method: string;
      path: string;
    }>();
    const header = req.headers[COMPANY_HEADER];
    if (req.user?.role === 'SUPER_ADMIN' && header) {
      this.logger.info(
        'TenantAccessGuard',
        'SUPERADMIN_TENANT_ACCESS',
        'El SUPER_ADMIN actúa dentro de una empresa',
        {
          userId: req.user.userId,
          companyId: header,
          method: req.method,
          path: req.path,
        },
      );
    }
    return true;
  }
}
