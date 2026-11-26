import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Sale, SaleItem } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AppLogger } from '../common/logger/app-logger.service';
import type { AuthUser } from '../auth/decorators';
import { PrismaService } from '../prisma/prisma.service';
import { assertSameCompany } from '../tenancy/tenant';
import { CreateSaleDto, ReissueSaleDto } from './sales.dto';
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

/** Cliente de BD: Prisma o la transacción en curso (reemisión). */
type Db = Pick<PrismaService, '$queryRaw'>;

interface PrepareRow {
  existing: string | null;
  products: ProductSnapshot[];
}

interface WriteRow {
  id: string;
  createdAt: Date;
  invoiceNumber: string;
  items: { id: string; productId: string }[];
}

/** Relaciones que acompañan una venta en el historial y en el detalle. */
const SALE_DETAIL = {
  ...SALE_INCLUDE,
  user: { select: { id: true, name: true } },
  correctsSale: { select: { id: true, invoiceNumber: true } },
  reissuedAs: { select: { id: true, invoiceNumber: true } },
  correctionRequests: {
    where: { status: 'PENDING' as const },
    select: { id: true, reason: true, createdAt: true, requestedById: true },
  },
} satisfies Prisma.SaleInclude;

type SaleToVoid = Sale & { items: SaleItem[] };

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: AppLogger,
    private readonly audit: AuditService,
  ) {}

  /**
   * Confirma una venta en 2 idas y vueltas a la BD (FAL-01):
   * 1) lectura de la clave de idempotencia y de los productos;
   * 2) una sola sentencia atómica que descuenta el stock y registra venta,
   *    líneas y movimientos (SWR-SALE-005/008), o no hace nada.
   * Reglas: SWR-SALE-003/004/007, SWR-SALE-010, SWR-MED-002, SWR-PAY-001.
   * Un producto pendiente de aprobación (creado por un vendedor) no se vende.
   * Multiempresa: solo se venden productos de la empresa del vendedor y la clave de
   * idempotencia es única por empresa (SWR-TEN-001).
   */
  async confirm(
    dto: CreateSaleDto,
    userId: string,
    companyId: string,
  ): Promise<ConfirmResult> {
    const started = Date.now();
    const productIds = [...new Set(dto.items.map((i) => i.productId))];

    const { existing, products } = await this.prepare(
      companyId,
      dto.idempotencyKey,
      productIds,
    );

    // Camino A — repetición de una solicitud ya confirmada: no se descuenta de nuevo.
    if (existing)
      return this.replayByKey(companyId, dto.idempotencyKey, userId);

    const result = planSale(dto.items, products);
    if (!result.ok && result.kind === 'INVALID') {
      throw new BadRequestException(result.errors);
    }
    // Camino B — stock insuficiente según la lectura: no se escribe nada.
    if (!result.ok) return this.rejectStock(result.shortages, userId);

    let row: WriteRow;
    try {
      row = await this.write(dto, userId, companyId, result.plan);
    } catch (e) {
      const code = pgErrorCode(e);
      // Camino B (carrera) — otra venta consumió el stock entre la lectura y la escritura.
      if (code === PG_DIVISION_BY_ZERO) {
        const fresh = await this.prepare(
          companyId,
          dto.idempotencyKey,
          productIds,
        );
        return this.rejectStock(
          this.currentShortages(result.plan, fresh.products),
          userId,
        );
      }
      // Camino C — dos solicitudes simultáneas con la misma clave: gana la primera.
      if (code === PG_UNIQUE_VIOLATION) {
        return this.replayByKey(companyId, dto.idempotencyKey, userId);
      }
      throw e;
    }

    // Camino D — venta confirmada.
    const sale = this.toSale(row, dto, userId, companyId, result.plan);
    this.logger.info('SalesService', 'SALE_CONFIRMED', 'Venta confirmada', {
      saleId: sale.id,
      userId,
      companyId,
      lines: sale.items.length,
      total: sale.total,
      paymentMethod: sale.paymentMethod,
      durationMs: Date.now() - started,
    });
    return { replayed: false, sale: serializeSale(sale) };
  }

  /**
   * Ida y vuelta 1: clave de idempotencia y productos en una sola consulta.
   * Un producto de otra empresa no se devuelve: para esta venta no existe.
   */
  private async prepare(
    companyId: string,
    key: string,
    ids: string[],
    db: Db = this.prisma,
  ): Promise<PrepareRow> {
    const rows = await db.$queryRaw<PrepareRow[]>`
      SELECT
        (SELECT s."id" FROM "Sale" s WHERE s."companyId" = ${companyId} AND s."idempotencyKey" = ${key}) AS "existing",
        COALESCE((
          SELECT json_agg(json_build_object(
            'id', p."id", 'name', p."name", 'unit', p."unit", 'price', p."price",
            'stock', p."stock", 'active', p."active" AND p."approved"))
          FROM "Product" p WHERE p."id" = ANY(${ids}::text[]) AND p."companyId" = ${companyId}
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
    companyId: string,
    plan: SalePlan,
    opts: { db?: Db; correctsSaleId?: string } = {},
  ): Promise<WriteRow> {
    const db = opts.db ?? this.prisma;
    const correctsSaleId = opts.correctsSaleId ?? null;
    const customerEmail = dto.customerEmail ?? null;
    const dIds = plan.discounts.map((d) => d.productId);
    const dQty = plan.discounts.map((d) => String(d.quantity));
    const lIds = plan.lines.map((l) => l.productId);
    const lQty = plan.lines.map((l) => String(l.quantity));
    const lUnit = plan.lines.map((l) => l.unit);
    const lPrice = plan.lines.map((l) => l.unitPrice);
    const lSub = plan.lines.map((l) => l.subtotal);

    const rows = await db.$queryRaw<WriteRow[]>`
      WITH d AS (
        SELECT * FROM unnest(${dIds}::text[], ${dQty}::numeric[]) AS d(product_id, qty)
      ),
      locked AS MATERIALIZED (
        -- Bloquea los productos siempre en el mismo orden (por id) para que dos ventas
        -- simultáneas no se esperen en ciclo (DEF-09: deadlock en la prueba de 20 concurrentes).
        SELECT p."id" FROM "Product" p
        WHERE p."id" = ANY(${dIds}::text[]) AND p."companyId" = ${companyId}
        ORDER BY p."id"
        FOR UPDATE
      ),
      upd AS (
        UPDATE "Product" p SET "stock" = p."stock" - d.qty, "updatedAt" = now()
        FROM d JOIN locked ON locked."id" = d.product_id
        WHERE p."id" = d.product_id AND p."companyId" = ${companyId} AND p."active" AND p."approved" AND p."stock" >= d.qty
        RETURNING p."id"
      ),
      guard AS MATERIALIZED (
        SELECT 1 / (CASE WHEN (SELECT count(*) FROM upd) = ${dIds.length} THEN 1 ELSE 0 END) AS ok
      ),
      inv AS (
        -- SWR-INV-001: consecutivo por empresa en la misma sentencia. Si la venta se aborta
        -- (stock o clave repetida), el contador también se deshace: sin huecos ni duplicados.
        -- Se toma después de la guardia, así que el orden de bloqueo es productos → empresa.
        UPDATE "Company" c SET "nextInvoiceNumber" = c."nextInvoiceNumber" + 1
        FROM guard
        WHERE c."id" = ${companyId} AND guard.ok = 1
        RETURNING c."invoicePrefix" || (c."nextInvoiceNumber" - 1) AS num
      ),
      sale AS (
        INSERT INTO "Sale" ("id", "companyId", "userId", "paymentMethod", "total", "idempotencyKey", "invoiceNumber", "customerEmail", "correctsSaleId")
        SELECT gen_random_uuid()::text, ${companyId}, ${userId}, ${dto.paymentMethod}::"PaymentMethod", ${plan.total}, ${dto.idempotencyKey}, inv.num, ${customerEmail}, ${correctsSaleId}
        FROM guard, inv
        -- La condición obliga a evaluar ok: sin ella PostgreSQL omite el cálculo y la guardia no actúa (DEF-08).
        WHERE guard.ok = 1
        RETURNING "id", "createdAt", "invoiceNumber"
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
        INSERT INTO "InventoryMovement" ("id", "companyId", "productId", "type", "quantity", "userId", "saleId")
        SELECT gen_random_uuid()::text, ${companyId}, d.product_id, 'SALE'::"MovementType", d.qty, ${userId}, sale."id"
        FROM sale, d
        RETURNING 1
      )
      SELECT sale."id", sale."createdAt", sale."invoiceNumber",
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
    companyId: string,
    plan: SalePlan,
  ): SaleWithItems {
    const pending = new Map<string, string[]>();
    for (const it of row.items) {
      pending.set(it.productId, [...(pending.get(it.productId) ?? []), it.id]);
    }
    return {
      id: row.id,
      companyId,
      userId,
      invoiceNumber: row.invoiceNumber,
      status: 'CONFIRMED',
      customerEmail: dto.customerEmail ?? null,
      voidedAt: null,
      voidedById: null,
      voidReason: null,
      correctsSaleId: null,
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
    companyId: string,
    idempotencyKey: string,
    userId: string,
  ): Promise<ConfirmResult> {
    const sale = await this.prisma.sale.findUnique({
      where: { companyId_idempotencyKey: { companyId, idempotencyKey } },
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

  /** Detalle de una venta de la empresa; el vendedor solo ve las suyas (SWR-ROLE-001). */
  async findOne(id: string, user: AuthUser, companyId: string) {
    const found = await this.prisma.sale.findUnique({
      where: { id },
      include: SALE_DETAIL,
    });
    const sale = assertSameCompany(
      found,
      companyId,
      this.logger,
      { entity: 'Sale', id, userId: user.userId },
      'Venta no encontrada',
    );
    if (user.role === 'SELLER' && sale.userId !== user.userId) {
      this.logger.warn(
        'SalesService',
        'AUTHZ_DENIED',
        'Un vendedor intentó ver una venta de otro vendedor',
        { reason: 'NOT_OWNER', saleId: id, userId: user.userId },
      );
      throw new NotFoundException('Venta no encontrada');
    }
    return serializeSale(sale);
  }

  /** Ventas de la empresa (ADMIN) o solo las propias (SELLER), cada una con su vendedor. */
  async list(user: AuthUser, companyId: string) {
    const sales = await this.prisma.sale.findMany({
      where:
        user.role === 'SELLER'
          ? { companyId, userId: user.userId }
          : { companyId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: SALE_DETAIL,
    });
    return sales.map(serializeSale);
  }

  /** Factura de una venta: datos de la empresa, vendedor, consecutivo y detalle (SWR-INV-002). */
  async invoice(id: string, user: AuthUser, companyId: string) {
    const sale = await this.findOne(id, user, companyId);
    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: {
        tradeName: true,
        legalName: true,
        taxId: true,
        email: true,
        phone: true,
        address: true,
        city: true,
        logoUrl: true,
        invoiceFooter: true,
        currency: true,
      },
    });
    return { sale, company };
  }

  /**
   * SWR-SALE-V01: anula una venta confirmada (solo ADMIN). La venta no se borra
   * ni se modifica en su contenido; se marca ANULADA con motivo y el stock vuelve,
   * todo en una transacción.
   */
  async void(id: string, reason: string, companyId: string, actor: AuthUser) {
    const sale = await this.loadSale(id, companyId, actor);
    await this.prisma.$transaction((tx) =>
      this.voidInTx(tx, sale, reason, companyId, actor),
    );
    this.logger.info('SalesService', 'SALE_VOIDED', 'Venta anulada', {
      saleId: id,
      companyId,
      userId: actor.userId,
    });
    return this.findOne(id, actor, companyId);
  }

  /**
   * SWR-SALE-V02: anula la venta original y registra una nueva vinculada a ella
   * (correctsSaleId), a nombre del mismo vendedor, con un consecutivo nuevo.
   * Si la venta nueva no se puede registrar (stock, datos), no se anula nada.
   */
  async reissue(
    id: string,
    dto: ReissueSaleDto,
    companyId: string,
    actor: AuthUser,
  ): Promise<ConfirmResult> {
    const original = await this.loadSale(id, companyId, actor);
    const productIds = [...new Set(dto.items.map((i) => i.productId))];
    let written: { row: WriteRow; plan: SalePlan };
    try {
      written = await this.prisma.$transaction(
        async (tx) => {
          await this.voidInTx(tx, original, dto.reason, companyId, actor);
          const db = tx as unknown as Db;
          // Se lee después de devolver el stock: la venta corregida puede reutilizarlo.
          const { existing, products } = await this.prepare(
            companyId,
            dto.idempotencyKey,
            productIds,
            db,
          );
          if (existing)
            throw new ConflictException(
              'La clave de idempotencia ya fue usada en otra venta',
            );
          const result = planSale(dto.items, products);
          if (!result.ok && result.kind === 'INVALID')
            throw new BadRequestException(result.errors);
          if (!result.ok)
            throw new ConflictException(result.shortages.map(shortageMessage));
          const row = await this.write(
            dto,
            original.userId,
            companyId,
            result.plan,
            {
              db,
              correctsSaleId: original.id,
            },
          );
          await this.audit.record(
            actor,
            {
              companyId,
              action: 'SALE_REISSUED',
              entity: 'Sale',
              entityId: row.id,
              before: {
                invoiceNumber: original.invoiceNumber,
                total: original.total,
              },
              after: {
                invoiceNumber: row.invoiceNumber,
                total: result.plan.total,
              },
              reason: dto.reason,
            },
            tx,
          );
          return { row, plan: result.plan };
        },
        // Con Supabase cada ida y vuelta tarda ~600 ms; la reemisión hace varias.
        { timeout: 20_000, maxWait: 10_000 },
      );
    } catch (e) {
      const code = pgErrorCode(e);
      if (code === PG_DIVISION_BY_ZERO)
        throw new ConflictException(
          'Otra venta consumió el stock mientras se reemitía. Intente de nuevo.',
        );
      if (code === PG_UNIQUE_VIOLATION)
        throw new ConflictException('La venta ya fue reemitida');
      throw e;
    }
    const sale = this.toSale(
      written.row,
      dto,
      original.userId,
      companyId,
      written.plan,
    );
    sale.correctsSaleId = original.id;
    this.logger.info('SalesService', 'SALE_REISSUED', 'Venta reemitida', {
      originalSaleId: id,
      saleId: sale.id,
      companyId,
      userId: actor.userId,
    });
    return { replayed: false, sale: serializeSale(sale) };
  }

  /** Marca la venta como anulada, devuelve el stock y deja la traza (misma transacción). */
  private async voidInTx(
    tx: Prisma.TransactionClient,
    sale: SaleToVoid,
    reason: string,
    companyId: string,
    actor: AuthUser,
  ) {
    // Solo una anulación gana si dos administradores actúan a la vez.
    const res = await tx.sale.updateMany({
      where: { id: sale.id, companyId, status: 'CONFIRMED' },
      data: {
        status: 'VOIDED',
        voidedAt: new Date(),
        voidedById: actor.userId,
        voidReason: reason,
      },
    });
    if (res.count === 0)
      throw new ConflictException('La venta ya está anulada');

    const returned = new Map<string, Prisma.Decimal>();
    for (const it of sale.items) {
      const prev = returned.get(it.productId) ?? new Prisma.Decimal(0);
      returned.set(it.productId, prev.add(it.quantity));
    }
    for (const [productId, qty] of returned) {
      await tx.product.update({
        where: { id: productId },
        data: { stock: { increment: qty }, updatedById: actor.userId },
      });
    }
    await tx.inventoryMovement.createMany({
      data: [...returned].map(([productId, qty]) => ({
        companyId,
        productId,
        type: 'VOID_RETURN' as const,
        quantity: qty,
        userId: actor.userId,
        saleId: sale.id,
        reason,
      })),
    });
    // Una solicitud de corrección pendiente queda resuelta con la anulación.
    await tx.saleCorrectionRequest.updateMany({
      where: { saleId: sale.id, status: 'PENDING' },
      data: {
        status: 'APPROVED',
        resolvedById: actor.userId,
        resolvedAt: new Date(),
        resolution: `Venta anulada: ${reason}`,
      },
    });
    await this.audit.record(
      actor,
      {
        companyId,
        action: 'SALE_VOIDED',
        entity: 'Sale',
        entityId: sale.id,
        before: {
          status: 'CONFIRMED',
          invoiceNumber: sale.invoiceNumber,
          total: sale.total,
        },
        after: { status: 'VOIDED' },
        reason,
      },
      tx,
    );
  }

  private async loadSale(
    id: string,
    companyId: string,
    actor: AuthUser,
  ): Promise<SaleToVoid> {
    const found = await this.prisma.sale.findUnique({
      where: { id },
      include: { items: true },
    });
    const sale = assertSameCompany(
      found,
      companyId,
      this.logger,
      { entity: 'Sale', id, userId: actor.userId },
      'Venta no encontrada',
    );
    if (sale.status === 'VOIDED')
      throw new ConflictException('La venta ya está anulada');
    return sale;
  }
}
