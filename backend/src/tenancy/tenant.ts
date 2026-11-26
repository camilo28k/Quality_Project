import {
  BadRequestException,
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { AuthUser } from '../auth/decorators';
import type { AppLogger } from '../common/logger/app-logger.service';

/** Cabecera con la que el SUPER_ADMIN indica en qué empresa actúa (diseño §4). */
export const COMPANY_HEADER = 'x-company-id';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type TenantResolution =
  | { ok: true; companyId: string; viaHeader: boolean }
  | { ok: false; reason: 'HEADER_REQUIRED' | 'HEADER_INVALID' | 'NO_COMPANY' };

/**
 * SWR-TEN-002: la empresa sale del usuario autenticado, nunca del cuerpo ni de la URL.
 * Única excepción: el SUPER_ADMIN, que no pertenece a ninguna empresa, la indica por cabecera.
 * Si un usuario de empresa envía la cabecera, se ignora.
 */
export function resolveTenant(
  user: Pick<AuthUser, 'role' | 'companyId'>,
  header: string | undefined,
): TenantResolution {
  if (user.role === 'SUPER_ADMIN') {
    if (!header) return { ok: false, reason: 'HEADER_REQUIRED' };
    if (!UUID.test(header)) return { ok: false, reason: 'HEADER_INVALID' };
    return { ok: true, companyId: header, viaHeader: true };
  }
  if (!user.companyId) return { ok: false, reason: 'NO_COMPANY' };
  return { ok: true, companyId: user.companyId, viaHeader: false };
}

/** Inyecta el id de la empresa en la que actúa la solicitud. */
export const CompanyId = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): string => {
    const req = ctx.switchToHttp().getRequest<{
      user: AuthUser;
      headers: Record<string, string | undefined>;
    }>();
    const r = resolveTenant(req.user, req.headers[COMPANY_HEADER]);
    if (r.ok) return r.companyId;
    if (r.reason === 'NO_COMPANY')
      throw new ForbiddenException('La cuenta no pertenece a una empresa');
    throw new BadRequestException(
      r.reason === 'HEADER_REQUIRED'
        ? 'Indique la empresa en la cabecera X-Company-Id'
        : 'X-Company-Id no es un identificador válido',
    );
  },
);

/**
 * SWR-TEN-001/002: un recurso de otra empresa se trata como inexistente (404, no se revela
 * que existe) y el intento queda registrado como AUTHZ_DENIED con motivo CROSS_TENANT.
 */
export function assertSameCompany<T extends { companyId: string }>(
  entity: T | null,
  companyId: string,
  logger: AppLogger,
  meta: { entity: string; id: string; userId?: string },
  notFoundMessage: string,
): T {
  if (!entity) throw new NotFoundException(notFoundMessage);
  if (entity.companyId !== companyId) {
    logger.warn(
      'Tenancy',
      'AUTHZ_DENIED',
      'Acceso a un recurso de otra empresa',
      {
        reason: 'CROSS_TENANT',
        entity: meta.entity,
        entityId: meta.id,
        userId: meta.userId,
        companyId,
      },
    );
    throw new NotFoundException(notFoundMessage);
  }
  return entity;
}
