import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService, changedFields } from '../audit/audit.service';
import type { AuthUser } from '../auth/decorators';
import { hashPassword } from '../auth/password.util';
import { UserStatusCache } from '../auth/user-status-cache';
import { AppLogger } from '../common/logger/app-logger.service';
import { isUniqueViolation } from '../platform/platform.service';
import { PrismaService } from '../prisma/prisma.service';
import { assertSameCompany } from '../tenancy/tenant';
import { CreateSellerDto, UpdateSellerDto } from './users.dto';
import { resetPassword } from './reset-password';

const USER_PUBLIC = {
  id: true,
  name: true,
  email: true,
  role: true,
  active: true,
  mustChangePassword: true,
  createdAt: true,
} as const;

/**
 * SWR-ROLE-002: el ADMIN gestiona solo los vendedores de su empresa.
 * No puede tocar otros ADMIN ni cuentas de otra empresa.
 */
@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: AppLogger,
    private readonly cache: UserStatusCache,
    private readonly audit: AuditService,
  ) {}

  list(companyId: string) {
    return this.prisma.user.findMany({
      where: { companyId },
      select: USER_PUBLIC,
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
    });
  }

  async createSeller(dto: CreateSellerDto, companyId: string, actor: AuthUser) {
    const actorId = actor.userId;
    try {
      const user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            companyId,
            name: dto.name,
            email: dto.email,
            role: 'SELLER',
            passwordHash: await hashPassword(dto.temporaryPassword),
            mustChangePassword: true,
          },
          select: USER_PUBLIC,
        });
        await this.audit.record(
          actor,
          {
            companyId,
            action: 'USER_CREATED',
            entity: 'User',
            entityId: created.id,
            after: {
              name: created.name,
              email: created.email,
              role: created.role,
            },
          },
          tx,
        );
        return created;
      });
      this.logger.info('UsersService', 'USER_CREATED', 'Vendedor creado', {
        companyId,
        createdUserId: user.id,
        role: 'SELLER',
        userId: actorId,
      });
      return user;
    } catch (e) {
      if (isUniqueViolation(e))
        throw new ConflictException('Ya existe una cuenta con ese correo');
      throw e;
    }
  }

  async updateSeller(
    id: string,
    dto: UpdateSellerDto,
    companyId: string,
    actor: AuthUser,
  ) {
    const actorId = actor.userId;
    const current = await this.findSeller(id, companyId, actorId);
    try {
      const user = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.user.update({
          where: { id },
          data: dto,
          select: USER_PUBLIC,
        });
        await this.audit.record(
          actor,
          {
            companyId,
            action: 'USER_UPDATED',
            entity: 'User',
            entityId: id,
            ...changedFields(current, { ...dto }),
          },
          tx,
        );
        return updated;
      });
      this.logger.info('UsersService', 'USER_UPDATED', 'Vendedor actualizado', {
        companyId,
        targetUserId: id,
        fields: Object.keys(dto),
        userId: actorId,
      });
      return user;
    } catch (e) {
      if (isUniqueViolation(e))
        throw new ConflictException('Ya existe una cuenta con ese correo');
      throw e;
    }
  }

  async setSellerActive(
    id: string,
    active: boolean,
    companyId: string,
    actor: AuthUser,
  ) {
    const actorId = actor.userId;
    const current = await this.findSeller(id, companyId, actorId);
    const user = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: { active },
        select: USER_PUBLIC,
      });
      await this.audit.record(
        actor,
        {
          companyId,
          action: active ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
          entity: 'User',
          entityId: id,
          before: { active: current.active },
          after: { active },
        },
        tx,
      );
      return updated;
    });
    // La sesión abierta del vendedor deja de valer de inmediato.
    this.cache.invalidate(id);
    this.logger.info(
      'UsersService',
      active ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
      active ? 'Vendedor activado' : 'Vendedor desactivado',
      { companyId, targetUserId: id, userId: actorId },
    );
    return user;
  }

  /** El ADMIN restablece la contraseña de un vendedor que la olvidó (queda temporal). */
  async resetSellerPassword(
    id: string,
    temporaryPassword: string,
    companyId: string,
    actor: AuthUser,
  ) {
    await this.findSeller(id, companyId, actor.userId);
    await resetPassword(this.prisma, this.audit, this.cache, {
      userId: id,
      companyId,
      temporaryPassword,
      actor,
    });
    this.logger.info(
      'UsersService',
      'USER_PASSWORD_RESET',
      'Contraseña restablecida',
      {
        companyId,
        targetUserId: id,
        userId: actor.userId,
      },
    );
    return { reset: true };
  }

  /** Solo vendedores de la propia empresa: un ADMIN no se edita aquí. */
  private async findSeller(id: string, companyId: string, actorId: string) {
    const found = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        role: true,
        companyId: true,
        name: true,
        email: true,
        active: true,
      },
    });
    const user = assertSameCompany(
      found && found.companyId
        ? { ...found, companyId: found.companyId }
        : null,
      companyId,
      this.logger,
      { entity: 'User', id, userId: actorId },
      'Vendedor no encontrado',
    );
    if (user.role !== 'SELLER')
      throw new NotFoundException('Vendedor no encontrado');
    return user;
  }
}
