import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Category, Prisma, Product } from '@prisma/client';
import { AuditService, changedFields } from '../audit/audit.service';
import type { AuthUser } from '../auth/decorators';
import { AppLogger } from '../common/logger/app-logger.service';
import { PrismaService } from '../prisma/prisma.service';
import { QUANTITY_MESSAGES, validateQuantity } from '../sales/sale-rules';
import { assertSameCompany } from '../tenancy/tenant';
import {
  CreateCategoryDto,
  CreateProductDto,
  SELLER_EDITABLE,
  UpdateCategoryDto,
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

/** Vista del producto para la auditoría (cantidades como número). */
function productAudit(p: Product) {
  return {
    name: p.name,
    description: p.description,
    categoryId: p.categoryId,
    cost: p.cost,
    price: p.price,
    minStock: Number(p.minStock),
    stock: Number(p.stock),
    active: p.active,
    approved: p.approved,
  };
}

const CATEGORY = { category: { select: { id: true, name: true } } } as const;

/**
 * Catálogo por empresa (SWR-TEN-001) con auditoría (SWR-AUD-001).
 * Categorías: solo el ADMIN las gestiona (SWR-ROLE-003).
 * Productos: el vendedor los crea pendientes de aprobación y solo edita nombre y descripción.
 */
@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: AppLogger,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------------- categorías

  /** SWR-CAT-001 con nombre único por empresa sin distinguir mayúsculas (AJ-06). */
  async createCategory(
    dto: CreateCategoryDto,
    companyId: string,
    actor?: AuthUser,
  ) {
    await this.assertCategoryNameFree(dto.name, companyId);
    const category = await this.prisma.$transaction(async (tx) => {
      const created = await tx.category.create({
        data: { name: dto.name, companyId },
      });
      if (actor)
        await this.audit.record(
          actor,
          {
            companyId,
            action: 'CATEGORY_CREATED',
            entity: 'Category',
            entityId: created.id,
            after: { name: created.name },
          },
          tx,
        );
      return created;
    });
    this.logger.info('CatalogService', 'CATEGORY_CREATED', 'Categoría creada', {
      categoryId: category.id,
      companyId,
    });
    return category;
  }

  /** Activas para todos; el ADMIN puede pedir también las inactivas, con su número de productos. */
  listCategories(companyId: string, includeInactive = false) {
    return this.prisma.category.findMany({
      where: includeInactive ? { companyId } : { companyId, active: true },
      orderBy: { name: 'asc' },
      ...(includeInactive
        ? { include: { _count: { select: { products: true } } } }
        : {}),
    });
  }

  async updateCategory(
    id: string,
    dto: UpdateCategoryDto,
    companyId: string,
    actor: AuthUser,
  ) {
    const current = await this.findCategory(id, companyId, actor.userId);
    if (current.name.toLowerCase() !== dto.name.toLowerCase())
      await this.assertCategoryNameFree(dto.name, companyId);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.category.update({
        where: { id },
        data: { name: dto.name },
      });
      await this.audit.record(
        actor,
        {
          companyId,
          action: 'CATEGORY_UPDATED',
          entity: 'Category',
          entityId: id,
          before: { name: current.name },
          after: { name: updated.name },
        },
        tx,
      );
      return updated;
    });
  }

  /** SWR-CAT-D01: desactivar o reactivar sin perder productos ni historial. */
  async setCategoryActive(
    id: string,
    active: boolean,
    companyId: string,
    actor: AuthUser,
  ) {
    const current = await this.findCategory(id, companyId, actor.userId);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.category.update({
        where: { id },
        data: { active },
      });
      await this.audit.record(
        actor,
        {
          companyId,
          action: active ? 'CATEGORY_ACTIVATED' : 'CATEGORY_DEACTIVATED',
          entity: 'Category',
          entityId: id,
          before: { active: current.active },
          after: { active },
        },
        tx,
      );
      return updated;
    });
  }

  /** SWR-CAT-D01: eliminar solo si no tiene productos (último recurso). */
  async deleteCategory(id: string, companyId: string, actor: AuthUser) {
    const current = await this.findCategory(id, companyId, actor.userId);
    const products = await this.prisma.product.count({
      where: { categoryId: id },
    });
    if (products > 0)
      throw new ConflictException(
        `La categoría «${current.name}» tiene ${products} producto(s). Desactívela en lugar de eliminarla.`,
      );
    await this.prisma.$transaction(async (tx) => {
      await tx.category.delete({ where: { id } });
      await this.audit.record(
        actor,
        {
          companyId,
          action: 'CATEGORY_DELETED',
          entity: 'Category',
          entityId: id,
          before: { name: current.name, active: current.active },
        },
        tx,
      );
    });
    return { deleted: true };
  }

  // ----------------------------------------------------------------- productos

  /**
   * SWR-PROD-001: registra el producto y su stock inicial como movimiento
   * INITIAL (D-05) en una sola transacción. Si lo crea un vendedor queda
   * pendiente de aprobación y no se puede vender (decisión a).
   */
  async createProduct(
    dto: CreateProductDto,
    userId: string,
    companyId: string,
    actor?: AuthUser,
  ) {
    const qtyError =
      dto.initialStock === 0
        ? null
        : validateQuantity(dto.unit, dto.initialStock);
    if (qtyError)
      throw new BadRequestException([
        `Stock inicial: ${QUANTITY_MESSAGES[qtyError]}`,
      ]);

    // Una categoría de otra empresa se trata como inexistente (SWR-TEN-001).
    const category = await this.prisma.category.findFirst({
      where: { id: dto.categoryId, companyId, active: true },
    });
    if (!category)
      throw new BadRequestException(['La categoría seleccionada no existe']);

    const approved = actor?.role !== 'SELLER';
    const product = await this.prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          companyId,
          name: dto.name,
          description: dto.description,
          categoryId: dto.categoryId,
          unit: dto.unit,
          cost: dto.cost,
          price: dto.price,
          stock: new Prisma.Decimal(dto.initialStock),
          minStock: new Prisma.Decimal(dto.minStock),
          approved,
          createdById: userId,
        },
        include: CATEGORY,
      });
      await tx.inventoryMovement.create({
        data: {
          companyId,
          productId: created.id,
          type: 'INITIAL',
          quantity: new Prisma.Decimal(dto.initialStock),
          userId,
          reason: 'Stock inicial',
        },
      });
      if (actor)
        await this.audit.record(
          actor,
          {
            companyId,
            action: 'PRODUCT_CREATED',
            entity: 'Product',
            entityId: created.id,
            after: productAudit(created),
          },
          tx,
        );
      return created;
    });

    this.logger.info('CatalogService', 'PRODUCT_CREATED', 'Producto creado', {
      productId: product.id,
      userId,
      companyId,
      approved,
    });
    return serializeProduct(product);
  }

  /**
   * ADMIN: puede incluir inactivos. Vendedor: activos y aprobados, más los
   * suyos pendientes de aprobación (para que sepa en qué van).
   */
  async listProducts(
    companyId: string,
    includeInactive: boolean,
    seller?: { userId: string },
  ) {
    const where: Prisma.ProductWhereInput = seller
      ? {
          companyId,
          active: true,
          OR: [{ approved: true }, { createdById: seller.userId }],
        }
      : includeInactive
        ? { companyId }
        : { companyId, active: true };
    const products = await this.prisma.product.findMany({
      where,
      include: CATEGORY,
      orderBy: { name: 'asc' },
    });
    return products.map(serializeProduct);
  }

  async updateProduct(
    id: string,
    dto: UpdateProductDto,
    companyId: string,
    actorOrUserId?: AuthUser | string,
  ) {
    const actor = typeof actorOrUserId === 'object' ? actorOrUserId : undefined;
    const userId = actor?.userId ?? (actorOrUserId as string | undefined);
    const current = await this.findOrThrow(id, companyId, userId);

    if (actor?.role === 'SELLER') {
      // Solo cuentan los campos enviados: el ValidationPipe deja en undefined los demás.
      const forbidden = Object.entries(dto)
        .filter(([, v]) => v !== undefined)
        .map(([k]) => k)
        .filter((k) => !SELLER_EDITABLE.includes(k as keyof UpdateProductDto));
      if (forbidden.length > 0)
        throw new ForbiddenException(
          'El vendedor solo puede editar nombre y descripción. Para el precio, envíe una solicitud de cambio.',
        );
    }
    if (dto.categoryId && dto.categoryId !== current.categoryId) {
      const category = await this.prisma.category.findFirst({
        where: { id: dto.categoryId, companyId, active: true },
      });
      if (!category)
        throw new BadRequestException(['La categoría seleccionada no existe']);
    }

    const data = {
      ...dto,
      minStock:
        dto.minStock === undefined
          ? undefined
          : new Prisma.Decimal(dto.minStock),
      ...(userId ? { updatedById: userId } : {}),
    };
    const product = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.product.update({
        where: { id },
        data,
        include: CATEGORY,
      });
      if (actor) {
        const diff = changedFields(
          productAudit(current),
          productAudit(updated),
        );
        if (Object.keys(diff.after).length > 0)
          await this.audit.record(
            actor,
            {
              companyId,
              // Los cambios de precio se distinguen para el panel de revisión.
              action:
                'price' in diff.after
                  ? 'PRODUCT_PRICE_CHANGED'
                  : 'PRODUCT_UPDATED',
              entity: 'Product',
              entityId: id,
              ...diff,
            },
            tx,
          );
      }
      return updated;
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
  async deactivateProduct(
    id: string,
    companyId: string,
    actorOrUserId?: AuthUser | string,
  ) {
    return this.setProductActive(id, false, companyId, actorOrUserId);
  }

  async setProductActive(
    id: string,
    active: boolean,
    companyId: string,
    actorOrUserId?: AuthUser | string,
  ) {
    const actor = typeof actorOrUserId === 'object' ? actorOrUserId : undefined;
    const userId = actor?.userId ?? (actorOrUserId as string | undefined);
    const current = await this.findOrThrow(id, companyId, userId);
    const product = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.product.update({
        where: { id },
        data: { active, ...(userId ? { updatedById: userId } : {}) },
        include: CATEGORY,
      });
      if (actor)
        await this.audit.record(
          actor,
          {
            companyId,
            action: active ? 'PRODUCT_ACTIVATED' : 'PRODUCT_DEACTIVATED',
            entity: 'Product',
            entityId: id,
            before: { active: current.active },
            after: { active },
          },
          tx,
        );
      return updated;
    });
    this.logger.info(
      'CatalogService',
      active ? 'PRODUCT_ACTIVATED' : 'PRODUCT_DEACTIVATED',
      active ? 'Producto activado' : 'Producto desactivado',
      { productId: id },
    );
    return serializeProduct(product);
  }

  /**
   * SWR-CAT-D01: eliminar solo si nunca se vendió. Se borran también sus
   * movimientos de stock y solicitudes; la auditoría conserva la foto completa.
   */
  async deleteProduct(id: string, companyId: string, actor: AuthUser) {
    const current = await this.findOrThrow(id, companyId, actor.userId);
    const sold = await this.prisma.saleItem.count({ where: { productId: id } });
    if (sold > 0)
      throw new ConflictException(
        `«${current.name}» ya tiene ventas registradas y no se puede eliminar. Desactívelo para que no aparezca en nuevas ventas.`,
      );
    await this.prisma.$transaction(async (tx) => {
      await tx.inventoryMovement.deleteMany({ where: { productId: id } });
      await tx.priceChangeRequest.deleteMany({ where: { productId: id } });
      await tx.product.delete({ where: { id } });
      await this.audit.record(
        actor,
        {
          companyId,
          action: 'PRODUCT_DELETED',
          entity: 'Product',
          entityId: id,
          before: productAudit(current),
        },
        tx,
      );
    });
    this.logger.info(
      'CatalogService',
      'PRODUCT_DELETED',
      'Producto eliminado',
      {
        productId: id,
        companyId,
      },
    );
    return { deleted: true };
  }

  // ------------------------------------------------------------------- apoyo

  async findOrThrow(id: string, companyId: string, userId?: string) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    return assertSameCompany(
      product,
      companyId,
      this.logger,
      { entity: 'Product', id, userId },
      'Producto no encontrado',
    );
  }

  private async findCategory(
    id: string,
    companyId: string,
    userId: string,
  ): Promise<Category> {
    const category = await this.prisma.category.findUnique({ where: { id } });
    return assertSameCompany(
      category,
      companyId,
      this.logger,
      { entity: 'Category', id, userId },
      'Categoría no encontrada',
    );
  }

  private async assertCategoryNameFree(name: string, companyId: string) {
    const existing = await this.prisma.category.findFirst({
      where: { companyId, name: { equals: name, mode: 'insensitive' } },
    });
    if (existing)
      throw new ConflictException(`Ya existe la categoría «${existing.name}»`);
  }
}
