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
import { CompanyId } from '../tenancy/tenant';
import {
  CreateSellerDto,
  ResetPasswordDto,
  UpdateSellerDto,
} from './users.dto';
import { UsersService } from './users.service';

@Roles('ADMIN', 'SUPER_ADMIN')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(@CompanyId() companyId: string) {
    return this.users.list(companyId);
  }

  @Post()
  create(
    @Body() dto: CreateSellerDto,
    @CompanyId() companyId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.users.createSeller(dto, companyId, user);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSellerDto,
    @CompanyId() companyId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.users.updateSeller(id, dto, companyId, user);
  }

  @Patch(':id/deactivate')
  deactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @CompanyId() companyId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.users.setSellerActive(id, false, companyId, user);
  }

  @Post(':id/reset-password')
  @HttpCode(200)
  resetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResetPasswordDto,
    @CompanyId() companyId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.users.resetSellerPassword(
      id,
      dto.temporaryPassword,
      companyId,
      user,
    );
  }

  @Patch(':id/activate')
  activate(
    @Param('id', ParseUUIDPipe) id: string,
    @CompanyId() companyId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.users.setSellerActive(id, true, companyId, user);
  }
}
