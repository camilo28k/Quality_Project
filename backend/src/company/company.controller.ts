import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { CurrentUser, Roles } from '../auth/decorators';
import type { AuthUser } from '../auth/decorators';
import { CompanyId } from '../tenancy/tenant';
import { CompleteOnboardingDto, UpdateCompanyProfileDto } from './company.dto';
import { CompanyService } from './company.service';

/** Empresa de la sesión (el SUPER_ADMIN usa X-Company-Id). */
@Controller('company')
export class CompanyController {
  constructor(private readonly company: CompanyService) {}

  /** Cualquier usuario de la empresa ve sus datos (p. ej. para la factura). */
  @Get()
  get(@CompanyId() companyId: string) {
    return this.company.get(companyId);
  }

  @Roles('ADMIN')
  @Post('onboarding')
  completeOnboarding(
    @Body() dto: CompleteOnboardingDto,
    @CompanyId() companyId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.company.completeOnboarding(companyId, dto, user.userId);
  }

  @Roles('ADMIN', 'SUPER_ADMIN')
  @Patch()
  update(
    @Body() dto: UpdateCompanyProfileDto,
    @CompanyId() companyId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.company.update(companyId, dto, user.userId);
  }
}
