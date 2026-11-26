import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser, Roles } from '../auth/decorators';
import type { AuthUser } from '../auth/decorators';
import { CompanyId } from '../tenancy/tenant';
import { CorrectionsService } from './corrections.service';
import {
  CreateSaleDto,
  ReasonDto,
  ReissueSaleDto,
  ResolveCorrectionDto,
} from './sales.dto';
import { SalesService } from './sales.service';

const ID = new ParseUUIDPipe();

@Controller()
export class SalesController {
  constructor(
    private readonly sales: SalesService,
    private readonly corrections: CorrectionsService,
  ) {}

  /** Venden el ADMIN y el SELLER de la empresa; el SUPER_ADMIN no vende. */
  @Roles('ADMIN', 'SELLER')
  @Post('sales')
  confirm(
    @Body() dto: CreateSaleDto,
    @CurrentUser() user: AuthUser,
    @CompanyId() companyId: string,
  ) {
    return this.sales.confirm(dto, user.userId, companyId);
  }

  @Get('sales')
  list(@CurrentUser() user: AuthUser, @CompanyId() companyId: string) {
    return this.sales.list(user, companyId);
  }

  @Get('sales/:id')
  findOne(
    @Param('id', ID) id: string,
    @CurrentUser() user: AuthUser,
    @CompanyId() companyId: string,
  ) {
    return this.sales.findOne(id, user, companyId);
  }

  /** SWR-INV-002 */
  @Get('sales/:id/invoice')
  invoice(
    @Param('id', ID) id: string,
    @CurrentUser() user: AuthUser,
    @CompanyId() companyId: string,
  ) {
    return this.sales.invoice(id, user, companyId);
  }

  /** SWR-SALE-V01: solo el ADMIN anula. */
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Post('sales/:id/void')
  @HttpCode(200)
  void(
    @Param('id', ID) id: string,
    @Body() dto: ReasonDto,
    @CurrentUser() user: AuthUser,
    @CompanyId() companyId: string,
  ) {
    return this.sales.void(id, dto.reason, companyId, user);
  }

  /** SWR-SALE-V02: solo el ADMIN reemite. */
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Post('sales/:id/reissue')
  reissue(
    @Param('id', ID) id: string,
    @Body() dto: ReissueSaleDto,
    @CurrentUser() user: AuthUser,
    @CompanyId() companyId: string,
  ) {
    return this.sales.reissue(id, dto, companyId, user);
  }

  /** SWR-SALE-V03: el vendedor pide la corrección de una venta suya. */
  @Roles('SELLER')
  @Post('sales/:id/correction-requests')
  requestCorrection(
    @Param('id', ID) id: string,
    @Body() dto: ReasonDto,
    @CurrentUser() user: AuthUser,
    @CompanyId() companyId: string,
  ) {
    return this.corrections.request(id, dto.reason, companyId, user);
  }

  @Roles('ADMIN', 'SELLER', 'SUPER_ADMIN')
  @Get('correction-requests')
  listCorrections(
    @CurrentUser() user: AuthUser,
    @CompanyId() companyId: string,
    @Query('status') status?: string,
  ) {
    return this.corrections.list(companyId, user, status);
  }

  @Roles('ADMIN', 'SUPER_ADMIN')
  @Post('correction-requests/:id/reject')
  @HttpCode(200)
  rejectCorrection(
    @Param('id', ID) id: string,
    @Body() dto: ResolveCorrectionDto,
    @CurrentUser() user: AuthUser,
    @CompanyId() companyId: string,
  ) {
    return this.corrections.reject(id, dto.resolution, companyId, user);
  }
}
