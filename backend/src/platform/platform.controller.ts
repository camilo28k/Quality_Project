import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { CurrentUser, Roles } from '../auth/decorators';
import type { AuthUser } from '../auth/decorators';
import {
  CreateCompanyAdminDto,
  CreateCompanyDto,
  UpdateCompanyDto,
} from './platform.dto';
import { PlatformService } from './platform.service';
import { ResetPasswordDto } from '../users/users.dto';

/** Rutas de plataforma: solo el SUPER_ADMIN (diseño §4). */
@Roles('SUPER_ADMIN')
@Controller('platform/companies')
export class PlatformController {
  constructor(private readonly platform: PlatformService) {}

  @Get()
  list() {
    return this.platform.listCompanies();
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.platform.getCompanyDetail(id);
  }

  /** Soporte: contraseña temporal para un usuario de una empresa. */
  @Post('users/:userId/reset-password')
  @HttpCode(200)
  resetPassword(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: ResetPasswordDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.platform.resetUserPassword(userId, dto.temporaryPassword, user);
  }

  @Post()
  create(@Body() dto: CreateCompanyDto, @CurrentUser() user: AuthUser) {
    return this.platform.createCompany(dto, user);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCompanyDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.platform.updateCompany(id, dto, user);
  }

  @Patch(':id/deactivate')
  deactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.platform.setCompanyActive(id, false, user);
  }

  @Patch(':id/activate')
  activate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.platform.setCompanyActive(id, true, user);
  }

  @Post(':id/admin')
  createAdmin(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateCompanyAdminDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.platform.createCompanyAdmin(id, dto, user);
  }
}
