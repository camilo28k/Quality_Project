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
import { CompanyId } from '../tenancy/tenant';
import { CreateSellerDto, UpdateSellerDto } from './users.dto';
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
    return this.users.createSeller(dto, companyId, user.userId);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSellerDto,
    @CompanyId() companyId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.users.updateSeller(id, dto, companyId, user.userId);
  }

  @Patch(':id/deactivate')
  deactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @CompanyId() companyId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.users.setSellerActive(id, false, companyId, user.userId);
  }

  @Patch(':id/activate')
  activate(
    @Param('id', ParseUUIDPipe) id: string,
    @CompanyId() companyId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.users.setSellerActive(id, true, companyId, user.userId);
  }
}
