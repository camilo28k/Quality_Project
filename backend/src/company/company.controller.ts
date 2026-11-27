import { Body, Controller, Get, HttpCode, Patch, Post } from '@nestjs/common';
import { CurrentUser, Roles } from '../auth/decorators';
import type { AuthUser } from '../auth/decorators';
import { CompanyId } from '../tenancy/tenant';
import { CompleteOnboardingDto, UpdateCompanyProfileDto } from './company.dto';
import { CompanyService } from './company.service';
import { EmailVerificationService } from './email-verification.service';
import { VerifyEmailDto } from './company.dto';

/** Empresa de la sesión (el SUPER_ADMIN usa X-Company-Id). */
@Controller('company')
export class CompanyController {
  constructor(
    private readonly company: CompanyService,
    private readonly verification: EmailVerificationService,
  ) {}

  /** SWR-MAIL-001 */
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Post('email/send-code')
  @HttpCode(200)
  sendCode(@CompanyId() companyId: string, @CurrentUser() user: AuthUser) {
    return this.verification.sendCode(companyId, user);
  }

  @Roles('ADMIN', 'SUPER_ADMIN')
  @Post('email/verify')
  @HttpCode(200)
  verifyEmail(
    @Body() dto: VerifyEmailDto,
    @CompanyId() companyId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.verification.verify(companyId, dto.code, user);
  }

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
    return this.company.completeOnboarding(companyId, dto, user);
  }

  @Roles('ADMIN', 'SUPER_ADMIN')
  @Patch()
  update(
    @Body() dto: UpdateCompanyProfileDto,
    @CompanyId() companyId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.company.update(companyId, dto, user);
  }
}
