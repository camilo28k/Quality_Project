import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { UserStatusCache } from '../auth/user-status-cache';
import { AppLogger } from '../common/logger/app-logger.service';
import { PrismaService } from '../prisma/prisma.service';
import { CompleteOnboardingDto, UpdateCompanyProfileDto } from './company.dto';

export const COMPANY_PROFILE = {
  id: true,
  tradeName: true,
  legalName: true,
  taxId: true,
  description: true,
  logoUrl: true,
  email: true,
  emailVerifiedAt: true,
  phone: true,
  address: true,
  city: true,
  invoicePrefix: true,
  nextInvoiceNumber: true,
  invoiceFooter: true,
  currency: true,
  timezone: true,
  onboardingCompleted: true,
  active: true,
} satisfies Prisma.CompanySelect;

/** Perfil de la empresa del ADMIN y asistente de configuración inicial (SWR-ONB-001/002). */
@Injectable()
export class CompanyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: AppLogger,
    private readonly cache: UserStatusCache,
  ) {}

  async get(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: COMPANY_PROFILE,
    });
    if (!company) throw new NotFoundException('Empresa no encontrada');
    return company;
  }

  async completeOnboarding(
    companyId: string,
    dto: CompleteOnboardingDto,
    actorId: string,
  ) {
    const current = await this.get(companyId);
    if (current.onboardingCompleted)
      throw new ConflictException(
        'La configuración inicial ya fue completada; edite los datos desde Configuración',
      );
    const { firstInvoiceNumber, ...profile } = dto;
    const company = await this.prisma.company.update({
      where: { id: companyId },
      data: {
        ...profile,
        nextInvoiceNumber: firstInvoiceNumber,
        onboardingCompleted: true,
        emailVerifiedAt:
          dto.email === current.email ? current.emailVerifiedAt : null,
      },
      select: COMPANY_PROFILE,
    });
    // Los usuarios de la empresa dejan de estar bloqueados de inmediato.
    this.cache.invalidateCompany(companyId);
    this.logger.info(
      'CompanyService',
      'COMPANY_ONBOARDING_COMPLETED',
      'Configuración inicial completada',
      { companyId, userId: actorId },
    );
    return company;
  }

  async update(
    companyId: string,
    dto: UpdateCompanyProfileDto,
    actorId: string,
  ) {
    const current = await this.get(companyId);
    const emailChanged = dto.email !== undefined && dto.email !== current.email;
    const company = await this.prisma.company.update({
      where: { id: companyId },
      // Un correo nuevo debe volver a verificarse antes de usarse en facturas (SWR-MAIL-001).
      data: { ...dto, ...(emailChanged ? { emailVerifiedAt: null } : {}) },
      select: COMPANY_PROFILE,
    });
    this.logger.info(
      'CompanyService',
      'COMPANY_UPDATED',
      'Empresa actualizada',
      {
        companyId,
        userId: actorId,
        fields: Object.keys(dto),
      },
    );
    return company;
  }
}
