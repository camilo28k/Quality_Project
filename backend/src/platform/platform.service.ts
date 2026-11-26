import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService, changedFields } from '../audit/audit.service';
import type { AuthUser } from '../auth/decorators';
import { hashPassword } from '../auth/password.util';
import { UserStatusCache } from '../auth/user-status-cache';
import { AppLogger } from '../common/logger/app-logger.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateCompanyAdminDto,
  CreateCompanyDto,
  UpdateCompanyDto,
} from './platform.dto';

const COMPANY_SUMMARY = {
  id: true,
  tradeName: true,
  email: true,
  emailVerifiedAt: true,
  onboardingCompleted: true,
  active: true,
  createdAt: true,
  _count: { select: { users: true, products: true, sales: true } },
} satisfies Prisma.CompanySelect;

/** Correo único: la base de datos lo exige y aquí se traduce a un mensaje claro. */
export function isUniqueViolation(e: unknown): boolean {
  return (
    e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002'
  );
}

/** Gestión de empresas por el SUPER_ADMIN (SWR-TEN-003, SWR-ROLE-001). */
@Injectable()
export class PlatformService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: AppLogger,
    private readonly cache: UserStatusCache,
    private readonly audit: AuditService,
  ) {}

  listCompanies() {
    return this.prisma.company.findMany({
      select: COMPANY_SUMMARY,
      orderBy: { createdAt: 'desc' },
    });
  }

  async getCompany(id: string) {
    const company = await this.prisma.company.findUnique({
      where: { id },
      include: {
        users: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            active: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!company) throw new NotFoundException('Empresa no encontrada');
    return company;
  }

  async createCompany(dto: CreateCompanyDto, actor: AuthUser) {
    const actorId = actor.userId;
    const company = await this.prisma.$transaction(async (tx) => {
      const created = await tx.company.create({
        data: { tradeName: dto.tradeName },
        select: COMPANY_SUMMARY,
      });
      await this.audit.record(
        actor,
        {
          companyId: created.id,
          action: 'COMPANY_CREATED',
          entity: 'Company',
          entityId: created.id,
          after: { tradeName: created.tradeName },
        },
        tx,
      );
      return created;
    });
    this.logger.info('PlatformService', 'COMPANY_CREATED', 'Empresa creada', {
      companyId: company.id,
      userId: actorId,
    });
    return company;
  }

  async updateCompany(id: string, dto: UpdateCompanyDto, actor: AuthUser) {
    const actorId = actor.userId;
    const current = await this.getCompany(id);
    const emailChanged = dto.email !== undefined && dto.email !== current.email;
    const data = { ...dto, ...(emailChanged ? { emailVerifiedAt: null } : {}) };
    const company = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.company.update({
        where: { id },
        // Un correo nuevo debe volver a verificarse antes de usarse en facturas (SWR-MAIL-001).
        data,
        select: COMPANY_SUMMARY,
      });
      const diff = changedFields(current, data);
      await this.audit.record(
        actor,
        {
          companyId: id,
          action: 'COMPANY_UPDATED',
          entity: 'Company',
          entityId: id,
          ...diff,
        },
        tx,
      );
      return updated;
    });
    this.logger.info(
      'PlatformService',
      'COMPANY_UPDATED',
      'Empresa actualizada',
      {
        companyId: id,
        userId: actorId,
        fields: Object.keys(dto),
      },
    );
    return company;
  }

  /** SWR-TEN-003: desactivar impide iniciar sesión a sus usuarios; los datos se conservan. */
  async setCompanyActive(id: string, active: boolean, actor: AuthUser) {
    const actorId = actor.userId;
    const current = await this.getCompany(id);
    const company = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.company.update({
        where: { id },
        data: { active },
        select: COMPANY_SUMMARY,
      });
      await this.audit.record(
        actor,
        {
          companyId: id,
          action: active ? 'COMPANY_ACTIVATED' : 'COMPANY_DEACTIVATED',
          entity: 'Company',
          entityId: id,
          before: { active: current.active },
          after: { active },
        },
        tx,
      );
      return updated;
    });
    // Las sesiones abiertas de la empresa dejan de valer de inmediato, no a los 30 s.
    this.cache.invalidateCompany(id);
    this.logger.info(
      'PlatformService',
      active ? 'COMPANY_ACTIVATED' : 'COMPANY_DEACTIVATED',
      active ? 'Empresa activada' : 'Empresa desactivada',
      { companyId: id, userId: actorId },
    );
    return company;
  }

  async createCompanyAdmin(
    companyId: string,
    dto: CreateCompanyAdminDto,
    actor: AuthUser,
  ) {
    const actorId = actor.userId;
    await this.getCompany(companyId);
    try {
      const user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            companyId,
            name: dto.name,
            email: dto.email,
            role: 'ADMIN',
            passwordHash: await hashPassword(dto.temporaryPassword),
            mustChangePassword: true,
          },
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            active: true,
          },
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
      this.logger.info(
        'PlatformService',
        'USER_CREATED',
        'Administrador de empresa creado',
        {
          companyId,
          createdUserId: user.id,
          role: 'ADMIN',
          userId: actorId,
        },
      );
      return user;
    } catch (e) {
      if (isUniqueViolation(e))
        throw new ConflictException('Ya existe una cuenta con ese correo');
      throw e;
    }
  }
}
