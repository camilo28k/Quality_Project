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
import {
  CreateCategoryDto,
  CreateProductDto,
  UpdateProductDto,
} from './catalog.dto';
import { CatalogService } from './catalog.service';

@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Roles('ADMIN')
  @Post('categories')
  createCategory(@Body() dto: CreateCategoryDto) {
    return this.catalog.createCategory(dto);
  }

  @Get('categories')
  listCategories() {
    return this.catalog.listCategories();
  }

  @Roles('ADMIN')
  @Post('products')
  createProduct(@Body() dto: CreateProductDto, @CurrentUser() user: AuthUser) {
    return this.catalog.createProduct(dto, user.userId);
  }

  @Get('products')
  listProducts(
    @CurrentUser() user: AuthUser,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.catalog.listProducts(
      user.role === 'ADMIN' && includeInactive === 'true',
    );
  }

  @Roles('ADMIN')
  @Patch('products/:id')
  updateProduct(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.catalog.updateProduct(id, dto);
  }

  @Roles('ADMIN')
  @Patch('products/:id/deactivate')
  deactivateProduct(@Param('id', ParseUUIDPipe) id: string) {
    return this.catalog.deactivateProduct(id);
  }
}
