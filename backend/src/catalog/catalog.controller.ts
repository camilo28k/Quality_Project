import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
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
  ApproveProductDto,
  CreateCategoryDto,
  CreateProductDto,
  PriceRequestDto,
  ResolveRequestDto,
  StockMovementDto,
  UpdateCategoryDto,
  UpdateProductDto,
} from './catalog.dto';
import { CatalogService } from './catalog.service';
import { InventoryService } from './inventory.service';
import { ReviewService } from './review.service';

const ID = new ParseUUIDPipe();

/**
 * Todo el catálogo es por empresa (SWR-TEN-001); la empresa sale de la sesión.
 * Permisos (SWR-ROLE-003): categorías solo ADMIN; productos los crea también el
 * vendedor (pendientes de aprobación); desactivar, eliminar y bajas solo ADMIN.
 */
@Controller()
export class CatalogController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly inventory: InventoryService,
    private readonly review: ReviewService,
  ) {}

  // ---- categorías
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Post('categories')
  createCategory(
    @Body() dto: CreateCategoryDto,
    @CompanyId() companyId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.catalog.createCategory(dto, companyId, user);
  }

  @Get('categories')
  listCategories(
    @CurrentUser() user: AuthUser,
    @CompanyId() companyId: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.catalog.listCategories(
      companyId,
      user.role !== 'SELLER' && includeInactive === 'true',
    );
  }

  @Roles('ADMIN', 'SUPER_ADMIN')
  @Patch('categories/:id')
  updateCategory(
    @Param('id', ID) id: string,
    @Body() dto: UpdateCategoryDto,
    @CompanyId() companyId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.catalog.updateCategory(id, dto, companyId, user);
  }

  @Roles('ADMIN', 'SUPER_ADMIN')
  @Patch('categories/:id/deactivate')
  deactivateCategory(
    @Param('id', ID) id: string,
    @CompanyId() companyId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.catalog.setCategoryActive(id, false, companyId, user);
  }

  @Roles('ADMIN', 'SUPER_ADMIN')
  @Patch('categories/:id/activate')
  activateCategory(
    @Param('id', ID) id: string,
    @CompanyId() companyId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.catalog.setCategoryActive(id, true, companyId, user);
  }

  @Roles('ADMIN', 'SUPER_ADMIN')
  @Delete('categories/:id')
  deleteCategory(
    @Param('id', ID) id: string,
    @CompanyId() companyId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.catalog.deleteCategory(id, companyId, user);
  }

  // ---- productos
  @Roles('ADMIN', 'SELLER', 'SUPER_ADMIN')
  @Post('products')
  createProduct(
    @Body() dto: CreateProductDto,
    @CurrentUser() user: AuthUser,
    @CompanyId() companyId: string,
  ) {
    return this.catalog.createProduct(dto, user.userId, companyId, user);
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
      user.role === 'SELLER' ? { userId: user.userId } : undefined,
    );
  }

  @Roles('ADMIN', 'SELLER', 'SUPER_ADMIN')
  @Patch('products/:id')
  updateProduct(
    @Param('id', ID) id: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser() user: AuthUser,
    @CompanyId() companyId: string,
  ) {
    return this.catalog.updateProduct(id, dto, companyId, user);
  }

  @Roles('ADMIN', 'SUPER_ADMIN')
  @Patch('products/:id/deactivate')
  deactivateProduct(
    @Param('id', ID) id: string,
    @CurrentUser() user: AuthUser,
    @CompanyId() companyId: string,
  ) {
    return this.catalog.setProductActive(id, false, companyId, user);
  }

  @Roles('ADMIN', 'SUPER_ADMIN')
  @Patch('products/:id/activate')
  activateProduct(
    @Param('id', ID) id: string,
    @CurrentUser() user: AuthUser,
    @CompanyId() companyId: string,
  ) {
    return this.catalog.setProductActive(id, true, companyId, user);
  }

  @Roles('ADMIN', 'SUPER_ADMIN')
  @Delete('products/:id')
  deleteProduct(
    @Param('id', ID) id: string,
    @CurrentUser() user: AuthUser,
    @CompanyId() companyId: string,
  ) {
    return this.catalog.deleteProduct(id, companyId, user);
  }

  @Roles('ADMIN', 'SUPER_ADMIN')
  @Post('products/:id/approve')
  @HttpCode(200)
  approveProduct(
    @Param('id', ID) id: string,
    @Body() dto: ApproveProductDto,
    @CurrentUser() user: AuthUser,
    @CompanyId() companyId: string,
  ) {
    return this.review.approveProduct(id, dto, companyId, user);
  }

  // ---- stock (SWR-STK-001)
  @Roles('ADMIN', 'SELLER', 'SUPER_ADMIN')
  @Post('products/:id/stock-entries')
  stockEntry(
    @Param('id', ID) id: string,
    @Body() dto: StockMovementDto,
    @CurrentUser() user: AuthUser,
    @CompanyId() companyId: string,
  ) {
    return this.inventory.entry(id, dto, companyId, user);
  }

  @Roles('ADMIN', 'SUPER_ADMIN')
  @Post('products/:id/stock-adjustments')
  stockAdjustment(
    @Param('id', ID) id: string,
    @Body() dto: StockMovementDto,
    @CurrentUser() user: AuthUser,
    @CompanyId() companyId: string,
  ) {
    return this.inventory.adjustOut(id, dto, companyId, user);
  }

  @Roles('ADMIN', 'SUPER_ADMIN')
  @Get('products/:id/movements')
  movements(
    @Param('id', ID) id: string,
    @CurrentUser() user: AuthUser,
    @CompanyId() companyId: string,
  ) {
    return this.inventory.movements(id, companyId, user);
  }

  // ---- precios y revisión (decisión a)
  @Roles('SELLER', 'ADMIN')
  @Post('products/:id/price-requests')
  requestPrice(
    @Param('id', ID) id: string,
    @Body() dto: PriceRequestDto,
    @CurrentUser() user: AuthUser,
    @CompanyId() companyId: string,
  ) {
    return this.review.requestPriceChange(id, dto, companyId, user);
  }

  @Roles('SELLER')
  @Get('price-requests/mine')
  myRequests(@CurrentUser() user: AuthUser, @CompanyId() companyId: string) {
    return this.review.listMyRequests(companyId, user.userId);
  }

  @Roles('ADMIN', 'SUPER_ADMIN')
  @Post('price-requests/:id/approve')
  @HttpCode(200)
  approvePrice(
    @Param('id', ID) id: string,
    @Body() dto: ResolveRequestDto,
    @CurrentUser() user: AuthUser,
    @CompanyId() companyId: string,
  ) {
    return this.review.resolvePriceRequest(id, true, dto, companyId, user);
  }

  @Roles('ADMIN', 'SUPER_ADMIN')
  @Post('price-requests/:id/reject')
  @HttpCode(200)
  rejectPrice(
    @Param('id', ID) id: string,
    @Body() dto: ResolveRequestDto,
    @CurrentUser() user: AuthUser,
    @CompanyId() companyId: string,
  ) {
    return this.review.resolvePriceRequest(id, false, dto, companyId, user);
  }

  @Roles('ADMIN', 'SUPER_ADMIN')
  @Get('review')
  reviewSummary(@CompanyId() companyId: string) {
    return this.review.summary(companyId);
  }
}
