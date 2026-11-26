import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
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

  async createCompany(dto: CreateCompanyDto, actorId: string) {
    const company = await this.prisma.company.create({
      data: { tradeName: dto.tradeName },
      select: COMPANY_SUMMARY,
    });
    this.logger.info('PlatformService', 'COMPANY_CREATED', 'Empresa creada', {
      companyId: company.id,
      userId: actorId,
    });
    return company;
  }

  async updateCompany(id: string, dto: UpdateCompanyDto, actorId: string) {
    const current = await this.getCompany(id);
    const emailChanged = dto.email !== undefined && dto.email !== current.email;
    const company = await this.prisma.company.update({
      where: { id },
      // Un correo nuevo debe volver a verificarse antes de usarse en facturas (SWR-MAIL-001).
      data: { ...dto, ...(emailChanged ? { emailVerifiedAt: null } : {}) },
      select: COMPANY_SUMMARY,
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
  async setCompanyActive(id: string, active: boolean, actorId: string) {
    await this.getCompany(id);
    const company = await this.prisma.company.update({
      where: { id },
      data: { active },
      select: COMPANY_SUMMARY,
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
    actorId: string,
  ) {
    await this.getCompany(companyId);
    try {
      const user = await this.prisma.user.create({
        data: {
          companyId,
          name: dto.name,
          email: dto.email,
          role: 'ADMIN',
          passwordHash: await hashPassword(dto.temporaryPassword),
          mustChangePassword: true,
        },
        select: { id: true, name: true, email: true, role: true, active: true },
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
