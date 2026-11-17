import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Sale, SaleItem } from '@prisma/client';
import { AppLogger } from '../common/logger/app-logger.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSaleDto } from './sales.dto';
import { planSale, ProductSnapshot, SalePlan } from './sale-plan';
import {
  findShortages,
  fromMilli,
  shortageMessage,
  StockShortage,
  toMilli,
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

/** Código de error de PostgreSQL dentro de un error de consulta cruda de Prisma. */
export function pgErrorCode(e: unknown): string | null {
  const meta = (e as { meta?: { code?: unknown } } | null)?.meta;
  if (typeof meta?.code === 'string') return meta.code;
  const match = /Code: `(\w+)`/.exec(String((e as Error)?.message ?? ''));
  return match ? match[1] : null;
}

const PG_DIVISION_BY_ZERO = '22012'; // guardia de stock de la sentencia de escritura
const PG_UNIQUE_VIOLATION = '23505'; // clave de idempotencia repetida

const SALE_INCLUDE = {
  items: { include: { product: { select: { name: true } } } },
} as const;

interface PrepareRow {
  existing: string | null;
  products: ProductSnapshot[];
}

interface WriteRow {
  id: string;
  createdAt: Date;
  items: { id: string; productId: string }[];
}

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: AppLogger,
  ) {}

  /**
   * Confirma una venta en 2 idas y vueltas a la BD (FAL-01):
   * 1) lectura de la clave de idempotencia y de los productos;
   * 2) una sola sentencia atómica que descuenta el stock y registra venta,
   *    líneas y movimientos (SWR-SALE-005/008), o no hace nada.
   * Reglas: SWR-SALE-003/004/007, SWR-SALE-010, SWR-MED-002, SWR-PAY-001.
   */
  async confirm(dto: CreateSaleDto, userId: string): Promise<ConfirmResult> {
    const started = Date.now();
    const productIds = [...new Set(dto.items.map((i) => i.productId))];

    const { existing, products } = await this.prepare(
      dto.idempotencyKey,
      productIds,
    );

    // Camino A — repetición de una solicitud ya confirmada: no se descuenta de nuevo.
    if (existing) return this.replayByKey(dto.idempotencyKey, userId);

    const result = planSale(dto.items, products);
    if (!result.ok && result.kind === 'INVALID') {
      throw new BadRequestException(result.errors);
    }
    // Camino B — stock insuficiente según la lectura: no se escribe nada.
    if (!result.ok) return this.rejectStock(result.shortages, userId);

    let row: WriteRow;
    try {
      row = await this.write(dto, userId, result.plan);
    } catch (e) {
      const code = pgErrorCode(e);
      // Camino B (carrera) — otra venta consumió el stock entre la lectura y la escritura.
      if (code === PG_DIVISION_BY_ZERO) {
        const fresh = await this.prepare(dto.idempotencyKey, productIds);
        return this.rejectStock(
          this.currentShortages(result.plan, fresh.products),
          userId,
        );
      }
      // Camino C — dos solicitudes simultáneas con la misma clave: gana la primera.
      if (code === PG_UNIQUE_VIOLATION) {
        return this.replayByKey(dto.idempotencyKey, userId);
      }
      throw e;
    }

    // Camino D — venta confirmada.
    const sale = this.toSale(row, dto, userId, result.plan);
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

  /** Ida y vuelta 1: clave de idempotencia y productos en una sola consulta. */
  private async prepare(key: string, ids: string[]): Promise<PrepareRow> {
    const rows = await this.prisma.$queryRaw<PrepareRow[]>`
      SELECT
        (SELECT s."id" FROM "Sale" s WHERE s."idempotencyKey" = ${key}) AS "existing",
        COALESCE((
          SELECT json_agg(json_build_object(
            'id', p."id", 'name', p."name", 'unit', p."unit", 'price', p."price",
            'stock', p."stock", 'active', p."active"))
          FROM "Product" p WHERE p."id" = ANY(${ids}::text[])
        ), '[]'::json) AS "products"`;
    const row = rows[0];
    return {
      existing: row.existing,
      products: row.products.map((p) => ({ ...p, stock: Number(p.stock) })),
    };
  }

  /**
   * Ida y vuelta 2: sentencia única y atómica.
   * El UPDATE solo descuenta si el stock sigue alcanzando; si algún producto
   * no se pudo descontar, la guardia divide por cero y PostgreSQL deshace
   * toda la sentencia (no queda descuento parcial ni venta).
   */
  private async write(
    dto: CreateSaleDto,
    userId: string,
    plan: SalePlan,
  ): Promise<WriteRow> {
    const dIds = plan.discounts.map((d) => d.productId);
    const dQty = plan.discounts.map((d) => String(d.quantity));
    const lIds = plan.lines.map((l) => l.productId);
    const lQty = plan.lines.map((l) => String(l.quantity));
    const lUnit = plan.lines.map((l) => l.unit);
    const lPrice = plan.lines.map((l) => l.unitPrice);
    const lSub = plan.lines.map((l) => l.subtotal);

    const rows = await this.prisma.$queryRaw<WriteRow[]>`
      WITH d AS (
        SELECT * FROM unnest(${dIds}::text[], ${dQty}::numeric[]) AS d(product_id, qty)
      ),
      locked AS MATERIALIZED (
        -- Bloquea los productos siempre en el mismo orden (por id) para que dos ventas
        -- simultáneas no se esperen en ciclo (DEF-09: deadlock en la prueba de 20 concurrentes).
        SELECT p."id" FROM "Product" p
        WHERE p."id" = ANY(${dIds}::text[])
        ORDER BY p."id"
        FOR UPDATE
      ),
      upd AS (
        UPDATE "Product" p SET "stock" = p."stock" - d.qty, "updatedAt" = now()
        FROM d JOIN locked ON locked."id" = d.product_id
        WHERE p."id" = d.product_id AND p."active" AND p."stock" >= d.qty
        RETURNING p."id"
      ),
      guard AS MATERIALIZED (
        SELECT 1 / (CASE WHEN (SELECT count(*) FROM upd) = ${dIds.length} THEN 1 ELSE 0 END) AS ok
      ),
      sale AS (
        INSERT INTO "Sale" ("id", "userId", "paymentMethod", "total", "idempotencyKey")
        SELECT gen_random_uuid()::text, ${userId}, ${dto.paymentMethod}::"PaymentMethod", ${plan.total}, ${dto.idempotencyKey}
        FROM guard
        -- La condición obliga a evaluar ok: sin ella PostgreSQL omite el cálculo y la guardia no actúa (DEF-08).
        WHERE guard.ok = 1
        RETURNING "id", "createdAt"
      ),
      l AS (
        SELECT * FROM unnest(${lIds}::text[], ${lQty}::numeric[], ${lUnit}::text[], ${lPrice}::int[], ${lSub}::int[])
          WITH ORDINALITY AS l(product_id, qty, unit, unit_price, subtotal, ord)
      ),
      items AS (
        INSERT INTO "SaleItem" ("id", "saleId", "productId", "quantity", "unit", "unitPrice", "subtotal")
        SELECT gen_random_uuid()::text, sale."id", l.product_id, l.qty, l.unit::"Unit", l.unit_price, l.subtotal
        FROM sale, l
        RETURNING "id", "productId"
      ),
      mov AS (
        INSERT INTO "InventoryMovement" ("id", "productId", "type", "quantity", "userId", "saleId")
        SELECT gen_random_uuid()::text, d.product_id, 'SALE'::"MovementType", d.qty, ${userId}, sale."id"
        FROM sale, d
        RETURNING 1
      )
      SELECT sale."id", sale."createdAt",
             COALESCE((SELECT json_agg(json_build_object('id', items."id", 'productId', items."productId")) FROM items), '[]'::json) AS "items",
             (SELECT count(*) FROM mov) AS "movements"
      FROM sale`;
    return rows[0];
  }

  /** Arma la respuesta con lo escrito; las líneas se emparejan por producto en orden. */
  private toSale(
    row: WriteRow,
    dto: CreateSaleDto,
    userId: string,
    plan: SalePlan,
  ): SaleWithItems {
    const pending = new Map<string, string[]>();
    for (const it of row.items) {
      pending.set(it.productId, [...(pending.get(it.productId) ?? []), it.id]);
    }
    return {
      id: row.id,
      userId,
      paymentMethod: dto.paymentMethod,
      total: plan.total,
      idempotencyKey: dto.idempotencyKey,
      createdAt: new Date(row.createdAt),
      items: plan.lines.map((l) => ({
        id: pending.get(l.productId)?.shift() ?? '',
        saleId: row.id,
        productId: l.productId,
        quantity: l.quantity as unknown as SaleItem['quantity'],
        unit: l.unit,
        unitPrice: l.unitPrice,
        subtotal: l.subtotal,
        product: { name: l.name },
      })),
    };
  }

  private currentShortages(
    plan: SalePlan,
    products: ProductSnapshot[],
  ): StockShortage[] {
    const requested = new Map(
      plan.discounts.map((d) => [d.productId, toMilli(d.quantity)]),
    );
    const stock = new Map(
      products.map((p) => [
        p.id,
        {
          name: p.name,
          stockMilli: p.active ? toMilli(p.stock) : 0,
        },
      ]),
    );
    const found = findShortages(requested, stock);
    // Si la nueva lectura ya alcanza, otra venta liberó stock: se informa igual el conflicto.
    return found.length > 0
      ? found
      : plan.discounts.map((d) => ({
          productId: d.productId,
          name: products.find((p) => p.id === d.productId)?.name ?? d.productId,
          availableMilli: 0,
          requestedMilli: toMilli(d.quantity),
        }));
  }

  private rejectStock(shortages: StockShortage[], userId: string): never {
    this.logger.warn(
      'SalesService',
      'SALE_REJECTED_STOCK',
      'Venta rechazada por stock insuficiente',
      {
        userId,
        shortages: shortages.map((s) => ({
          productId: s.productId,
          available: fromMilli(s.availableMilli),
          requested: fromMilli(s.requestedMilli),
        })),
      },
    );
    throw new ConflictException(shortages.map(shortageMessage));
  }

  private async replayByKey(
    idempotencyKey: string,
    userId: string,
  ): Promise<ConfirmResult> {
    const sale = await this.prisma.sale.findUnique({
      where: { idempotencyKey },
      include: SALE_INCLUDE,
    });
    if (!sale) throw new ConflictException('No se pudo confirmar la venta');
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
