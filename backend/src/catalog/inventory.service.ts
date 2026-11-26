import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/decorators';
import { AppLogger } from '../common/logger/app-logger.service';
import { PrismaService } from '../prisma/prisma.service';
import { QUANTITY_MESSAGES, validateQuantity } from '../sales/sale-rules';
import { CatalogService, serializeProduct } from './catalog.service';
import { StockMovementDto } from './catalog.dto';

/**
 * SWR-STK-001: entradas (ADMIN y vendedor) y bajas (solo ADMIN) con motivo.
 * Cada movimiento queda en InventoryMovement y en la auditoría.
 */
@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
    private readonly audit: AuditService,
    private readonly logger: AppLogger,
  ) {}

  entry(id: string, dto: StockMovementDto, companyId: string, actor: AuthUser) {
    return this.move(id, dto, companyId, actor, 'ENTRY');
  }

  adjustOut(
    id: string,
    dto: StockMovementDto,
    companyId: string,
    actor: AuthUser,
  ) {
    return this.move(id, dto, companyId, actor, 'ADJUSTMENT_OUT');
  }

  private async move(
    id: string,
    dto: StockMovementDto,
    companyId: string,
    actor: AuthUser,
    type: 'ENTRY' | 'ADJUSTMENT_OUT',
  ) {
    const product = await this.catalog.findOrThrow(id, companyId, actor.userId);
    const qtyError = validateQuantity(product.unit, dto.quantity);
    if (qtyError)
      throw new BadRequestException([
        `Cantidad: ${QUANTITY_MESSAGES[qtyError]}`,
      ]);
    const qty = new Prisma.Decimal(dto.quantity);

    const updated = await this.prisma.$transaction(async (tx) => {
      // La baja solo se aplica si el stock alcanza, en la misma sentencia (sin carrera).
      const res = await tx.product.updateMany({
        where:
          type === 'ADJUSTMENT_OUT'
            ? { id, companyId, stock: { gte: qty } }
            : { id, companyId },
        data: {
          stock: type === 'ENTRY' ? { increment: qty } : { decrement: qty },
          updatedById: actor.userId,
        },
      });
      if (res.count === 0)
        throw new ConflictException(
          `Stock insuficiente: «${product.name}» tiene ${Number(product.stock)} y se quiere dar de baja ${dto.quantity}`,
        );
      await tx.inventoryMovement.create({
        data: {
          companyId,
          productId: id,
          type,
          quantity: qty,
          userId: actor.userId,
          reason: dto.reason,
        },
      });
      const after = await tx.product.findUniqueOrThrow({
        where: { id },
        include: { category: { select: { id: true, name: true } } },
      });
      await this.audit.record(
        actor,
        {
          companyId,
          action: type === 'ENTRY' ? 'STOCK_ENTRY' : 'STOCK_ADJUSTMENT_OUT',
          entity: 'Product',
          entityId: id,
          before: { stock: Number(product.stock) },
          after: { stock: Number(after.stock), quantity: dto.quantity },
          reason: dto.reason,
        },
        tx,
      );
      return after;
    });
    this.logger.info(
      'InventoryService',
      type === 'ENTRY' ? 'STOCK_ENTRY' : 'STOCK_ADJUSTMENT_OUT',
      'Movimiento de stock',
      {
        productId: id,
        companyId,
        userId: actor.userId,
        quantity: dto.quantity,
      },
    );
    return serializeProduct(updated);
  }

  /** Historial de movimientos de un producto (ADMIN). */
  async movements(id: string, companyId: string, actor: AuthUser) {
    await this.catalog.findOrThrow(id, companyId, actor.userId);
    const rows = await this.prisma.inventoryMovement.findMany({
      where: { productId: id, companyId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { user: { select: { id: true, name: true } } },
    });
    return rows.map((m) => ({ ...m, quantity: Number(m.quantity) }));
  }
}
