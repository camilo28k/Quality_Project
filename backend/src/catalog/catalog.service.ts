import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Product } from '@prisma/client';
import { AppLogger } from '../common/logger/app-logger.service';
import { PrismaService } from '../prisma/prisma.service';
import { QUANTITY_MESSAGES, validateQuantity } from '../sales/sale-rules';
import {
  CreateCategoryDto,
  CreateProductDto,
  UpdateProductDto,
} from './catalog.dto';

/** Producto con cantidades como number para la API. */
export function serializeProduct(
  p: Product & { category?: { id: string; name: string } },
) {
  return {
    ...p,
    stock: Number(p.stock),
    minStock: Number(p.minStock),
    lowStock: Number(p.stock) <= Number(p.minStock),
  };
}

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: AppLogger,
  ) {}

  /** SWR-CAT-001 con nombre único sin distinguir mayúsculas (AJ-06). */
  async createCategory(dto: CreateCategoryDto) {
    const existing = await this.prisma.category.findFirst({
      where: { name: { equals: dto.name, mode: 'insensitive' } },
    });
    if (existing)
      throw new ConflictException(`Ya existe la categoría «${existing.name}»`);
    const category = await this.prisma.category.create({
      data: { name: dto.name },
    });
    this.logger.info('CatalogService', 'CATEGORY_CREATED', 'Categoría creada', {
      categoryId: category.id,
    });
    return category;
  }

  listCategories() {
    return this.prisma.category.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * SWR-PROD-001: registra el producto y su stock inicial como movimiento
   * INITIAL (D-05) en una sola transacción.
   */
  async createProduct(dto: CreateProductDto, userId: string) {
    const qtyError =
      dto.initialStock === 0
        ? null
        : validateQuantity(dto.unit, dto.initialStock);
    if (qtyError)
      throw new BadRequestException([
        `Stock inicial: ${QUANTITY_MESSAGES[qtyError]}`,
      ]);

    const category = await this.prisma.category.findFirst({
      where: { id: dto.categoryId, active: true },
    });
    if (!category)
      throw new BadRequestException(['La categoría seleccionada no existe']);

    const product = await this.prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          name: dto.name,
          categoryId: dto.categoryId,
          unit: dto.unit,
          cost: dto.cost,
          price: dto.price,
          stock: new Prisma.Decimal(dto.initialStock),
          minStock: new Prisma.Decimal(dto.minStock),
        },
        include: { category: { select: { id: true, name: true } } },
      });
      await tx.inventoryMovement.create({
        data: {
          productId: created.id,
          type: 'INITIAL',
          quantity: new Prisma.Decimal(dto.initialStock),
          userId,
        },
      });
      return created;
    });

    this.logger.info('CatalogService', 'PRODUCT_CREATED', 'Producto creado', {
      productId: product.id,
      userId,
    });
    return serializeProduct(product);
  }

  /** El vendedor solo ve activos; el administrador puede pedir también inactivos. */
  async listProducts(includeInactive: boolean) {
    const products = await this.prisma.product.findMany({
      where: includeInactive ? {} : { active: true },
      include: { category: { select: { id: true, name: true } } },
      orderBy: { name: 'asc' },
    });
    return products.map(serializeProduct);
  }

  async updateProduct(id: string, dto: UpdateProductDto) {
    await this.findOrThrow(id);
    const product = await this.prisma.product.update({
      where: { id },
      data: {
        ...dto,
        minStock:
          dto.minStock === undefined
            ? undefined
            : new Prisma.Decimal(dto.minStock),
      },
      include: { category: { select: { id: true, name: true } } },
    });
    this.logger.info(
      'CatalogService',
      'PRODUCT_UPDATED',
      'Producto actualizado',
      {
        productId: id,
        fields: Object.keys(dto),
      },
    );
    return serializeProduct(product);
  }

  /** SWR-PROD-005: desactiva sin borrar ventas ni movimientos. */
  async deactivateProduct(id: string) {
    await this.findOrThrow(id);
    const product = await this.prisma.product.update({
      where: { id },
      data: { active: false },
      include: { category: { select: { id: true, name: true } } },
    });
    this.logger.info(
      'CatalogService',
      'PRODUCT_DEACTIVATED',
      'Producto desactivado',
      {
        productId: id,
      },
    );
    return serializeProduct(product);
  }

  private async findOrThrow(id: string) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Producto no encontrado');
    return product;
  }
}
