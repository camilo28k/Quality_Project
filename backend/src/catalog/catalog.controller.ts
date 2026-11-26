import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser, Roles } from '../auth/decorators';
import type { AuthUser } from '../auth/decorators';
import { CompanyId } from '../tenancy/tenant';
import {
  CreateCategoryDto,
  CreateProductDto,
  UpdateProductDto,
} from './catalog.dto';
import { CatalogService } from './catalog.service';

/** Todo el catálogo es por empresa (SWR-TEN-001); la empresa sale de la sesión. */
@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Roles('ADMIN', 'SUPER_ADMIN')
  @Post('categories')
  createCategory(
    @Body() dto: CreateCategoryDto,
    @CompanyId() companyId: string,
  ) {
    return this.catalog.createCategory(dto, companyId);
  }

  @Get('categories')
  listCategories(@CompanyId() companyId: string) {
    return this.catalog.listCategories(companyId);
  }

  @Roles('ADMIN', 'SUPER_ADMIN')
  @Post('products')
  createProduct(
    @Body() dto: CreateProductDto,
    @CurrentUser() user: AuthUser,
    @CompanyId() companyId: string,
  ) {
    return this.catalog.createProduct(dto, user.userId, companyId);
  }

  @Get('products')
  listProducts(
    @CurrentUser() user: AuthUser,
    @CompanyId() companyId: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.catalog.listProducts(
      companyId,
      user.role !== 'SELLER' && includeInactive === 'true',
    );
  }

  @Roles('ADMIN', 'SUPER_ADMIN')
  @Patch('products/:id')
  updateProduct(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser() user: AuthUser,
    @CompanyId() companyId: string,
  ) {
    return this.catalog.updateProduct(id, dto, companyId, user.userId);
  }

  @Roles('ADMIN', 'SUPER_ADMIN')
  @Patch('products/:id/deactivate')
  deactivateProduct(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @CompanyId() companyId: string,
  ) {
    return this.catalog.deactivateProduct(id, companyId, user.userId);
  }
}
