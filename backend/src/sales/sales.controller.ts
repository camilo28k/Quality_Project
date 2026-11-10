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
import { CreateSaleDto } from './sales.dto';
import { SalesService } from './sales.service';

@Controller('sales')
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  @Roles('ADMIN', 'SELLER')
  @Post()
  confirm(@Body() dto: CreateSaleDto, @CurrentUser() user: AuthUser) {
    return this.sales.confirm(dto, user.userId);
  }

  @Get()
  list() {
    return this.sales.list();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.sales.findOne(id);
  }
}
