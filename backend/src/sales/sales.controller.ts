import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { CurrentUser, Roles } from '../auth/decorators';
import type { AuthUser } from '../auth/decorators';
import { CompanyId } from '../tenancy/tenant';
import { CreateSaleDto } from './sales.dto';
import { SalesService } from './sales.service';

@Controller('sales')
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  /** Venden el ADMIN y el SELLER de la empresa; el SUPER_ADMIN no vende. */
  @Roles('ADMIN', 'SELLER')
  @Post()
  confirm(
    @Body() dto: CreateSaleDto,
    @CurrentUser() user: AuthUser,
    @CompanyId() companyId: string,
  ) {
    return this.sales.confirm(dto, user.userId, companyId);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @CompanyId() companyId: string) {
    return this.sales.list(user, companyId);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @CompanyId() companyId: string,
  ) {
    return this.sales.findOne(id, user, companyId);
  }
}
