import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Sale, SaleItem } from '@prisma/client';
import { AppLogger } from '../common/logger/app-logger.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSaleDto } from './sales.dto';
import {
  aggregateByProduct,
  findShortages,
  fromMilli,
  lineSubtotal,
  QUANTITY_MESSAGES,
  saleTotal,
  shortageMessage,
  StockShortage,
  toMilli,
  validateQuantity,
} from './sale-rules';

type SaleWithItems = Sale & {
  items: (SaleItem & { product?: { name: string } })[];
};

export interface ConfirmResult {
  replayed: boolean;
  sale: ReturnType<typeof serializeSale>;
}

export function serializeSale(sale: SaleWithItems) {
  return {
    ...sale,
    items: sale.items.map((i) => ({ ...i, quantity: Number(i.quantity) })),
  };
}

class StockError extends Error {
  constructor(readonly shortages: StockShortage[]) {
    super('STOCK');
  }
}

const SALE_INCLUDE = {
  items: { include: { product: { select: { name: true } } } },
} as const;

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: AppLogger,
  ) {}

  /**
   * Confirma una venta:
   * SWR-SALE-003/004 (subtotales y total), SWR-SALE-005 (precio aplicado),
   * SWR-SALE-007 (stock insuficiente), SWR-SALE-008 (descuento),
   * SWR-SALE-010 (idempotencia), SWR-MED-002 (decimales), SWR-PAY-001.
   */
  async confirm(dto: CreateSaleDto, userId: string): Promise<ConfirmResult> {
    const started = Date.now();

    // Camino A — repetición de una solicitud ya confirmada: no se descuenta de nuevo.
    const previous = await this.findByKey(dto.idempotencyKey);
    if (previous) return this.replay(previous, userId);

    let sale: SaleWithItems;
    try {
      sale = await this.prisma.$transaction((tx) =>
        this.confirmInTx(tx, dto, userId),
      );
    } catch (e) {
      // Camino B — rechazo por stock (validación previa o carrera concurrente).
      if (e instanceof StockError) {
        this.logger.warn(
          'SalesService',
          'SALE_REJECTED_STOCK',
          'Venta rechazada por stock insuficiente',
          {
            userId,
            shortages: e.shortages.map((s) => ({
              productId: s.productId,
              available: fromMilli(s.availableMilli),
              requested: fromMilli(s.requestedMilli),
            })),
          },
        );
        throw new ConflictException(e.shortages.map(shortageMessage));
      }
      // Camino C — dos solicitudes simultáneas con la misma clave: gana la primera.
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        const winner = await this.findByKey(dto.idempotencyKey);
        if (winner) return this.replay(winner, userId);
      }
      throw e;
    }

    // Camino D — venta confirmada.
    this.logger.info('SalesService', 'SALE_CONFIRMED', 'Venta confirmada', {
      saleId: sale.id,
      userId,
      lines: sale.items.length,
      total: sale.total,
      paymentMethod: sale.paymentMethod,
      durationMs: Date.now() - started,
    });
    return { replayed: false, sale: serializeSale(sale) };
  }

  private async confirmInTx(
    tx: Prisma.TransactionClient,
    dto: CreateSaleDto,
    userId: string,
  ): Promise<SaleWithItems> {
    const ids = [...new Set(dto.items.map((i) => i.productId))];
    const products = await tx.product.findMany({ where: { id: { in: ids } } });
    const byId = new Map(products.map((p) => [p.id, p]));

    const errors: string[] = [];
    const lines = dto.items.map((item, index) => {
      const product = byId.get(item.productId);
      if (!product || !product.active) {
        errors.push(`Línea ${index + 1}: el producto no está disponible`);
        return null;
      }
      const qtyError = validateQuantity(product.unit, item.quantity);
      if (qtyError) {
        errors.push(
          `Línea ${index + 1} («${product.name}»): ${QUANTITY_MESSAGES[qtyError]}`,
        );
        return null;
      }
      return { product, quantityMilli: toMilli(item.quantity) };
    });
    if (errors.length > 0) throw new BadRequestException(errors);
    const valid = lines.filter((l) => l !== null);

    const requested = aggregateByProduct(
      valid.map((l) => ({
        productId: l.product.id,
        quantityMilli: l.quantityMilli,
      })),
    );
    const stock = new Map(
      products.map((p) => [
        p.id,
        { name: p.name, stockMilli: toMilli(Number(p.stock)) },
      ]),
    );
    const shortages = findShortages(requested, stock);
    if (shortages.length > 0) throw new StockError(shortages);

    // Descuento condicional: solo si el stock sigue alcanzando (protege ante ventas simultáneas).
    for (const [productId, milli] of requested) {
      const qty = new Prisma.Decimal(fromMilli(milli));
      const { count } = await tx.product.updateMany({
        where: { id: productId, active: true, stock: { gte: qty } },
        data: { stock: { decrement: qty } },
      });
      if (count === 0) {
        const fresh = await tx.product.findUnique({ where: { id: productId } });
        throw new StockError([
          {
            productId,
            name: fresh?.name ?? productId,
            availableMilli: toMilli(Number(fresh?.stock ?? 0)),
            requestedMilli: milli,
          },
        ]);
      }
    }

    const items = valid.map((l) => {
      const subtotal = lineSubtotal(l.quantityMilli, l.product.price);
      return {
        productId: l.product.id,
        quantity: new Prisma.Decimal(fromMilli(l.quantityMilli)),
        unit: l.product.unit,
        unitPrice: l.product.price, // precio aplicado (SWR-SALE-005)
        subtotal,
      };
    });

    const sale = await tx.sale.create({
      data: {
        userId,
        paymentMethod: dto.paymentMethod,
        idempotencyKey: dto.idempotencyKey,
        total: saleTotal(items.map((i) => i.subtotal)),
        items: { create: items },
      },
      include: SALE_INCLUDE,
    });

    await tx.inventoryMovement.createMany({
      data: [...requested].map(([productId, milli]) => ({
        productId,
        type: 'SALE' as const,
        quantity: new Prisma.Decimal(fromMilli(milli)),
        userId,
        saleId: sale.id,
      })),
    });
    return sale;
  }

  private findByKey(idempotencyKey: string) {
    return this.prisma.sale.findUnique({
      where: { idempotencyKey },
      include: SALE_INCLUDE,
    });
  }

  private replay(sale: SaleWithItems, userId: string): ConfirmResult {
    if (sale.userId !== userId) {
      throw new ConflictException(
        'La clave de idempotencia ya fue usada por otro usuario',
      );
    }
    this.logger.info(
      'SalesService',
      'SALE_REPLAYED',
      'Solicitud repetida; se devuelve la venta existente sin descontar inventario',
      { saleId: sale.id, userId },
    );
    return { replayed: true, sale: serializeSale(sale) };
  }

  async findOne(id: string) {
    const sale = await this.prisma.sale.findUnique({
      where: { id },
      include: {
        ...SALE_INCLUDE,
        user: { select: { id: true, name: true } },
      },
    });
    if (!sale) throw new NotFoundException('Venta no encontrada');
    return serializeSale(sale);
  }

  async list() {
    const sales = await this.prisma.sale.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        ...SALE_INCLUDE,
        user: { select: { id: true, name: true } },
      },
    });
    return sales.map(serializeSale);
  }
}
