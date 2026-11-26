import {
  Body,
  Controller,
  Get,
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
    return this.platform.getCompany(id);
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
