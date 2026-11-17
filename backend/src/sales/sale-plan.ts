import {
  aggregateByProduct,
  findShortages,
  fromMilli,
  lineSubtotal,
  QUANTITY_MESSAGES,
  saleTotal,
  StockShortage,
  toMilli,
  UnitCode,
  validateQuantity,
} from './sale-rules';

/** Producto tal como lo lee la consulta de preparación de la venta. */
export interface ProductSnapshot {
  id: string;
  name: string;
  unit: UnitCode;
  price: number;
  stock: number;
  active: boolean;
}

export interface PlannedLine {
  productId: string;
  name: string;
  unit: UnitCode;
  quantity: number;
  unitPrice: number; // precio aplicado (SWR-SALE-005)
  subtotal: number;
}

export interface SalePlan {
  lines: PlannedLine[];
  /** Cantidad total por producto, para el descuento condicional (AJ-04). */
  discounts: { productId: string; quantity: number }[];
  total: number;
}

export type PlanResult =
  | { ok: true; plan: SalePlan }
  | { ok: false; kind: 'INVALID'; errors: string[] }
  | { ok: false; kind: 'STOCK'; shortages: StockShortage[] };

/**
 * Arma la venta a partir de una lectura de los productos, sin tocar la BD.
 * Aplica las reglas de negocio (SWR-MED-002, SWR-SALE-003/004/007) antes de
 * escribir, para que la escritura sea una sola sentencia atómica (FAL-01).
 */
export function planSale(
  items: { productId: string; quantity: number }[],
  products: ProductSnapshot[],
): PlanResult {
  const byId = new Map(products.map((p) => [p.id, p]));
  const errors: string[] = [];
  const lines: PlannedLine[] = [];

  items.forEach((item, index) => {
    const product = byId.get(item.productId);
    if (!product || !product.active) {
      errors.push(`Línea ${index + 1}: el producto no está disponible`);
      return;
    }
    const qtyError = validateQuantity(product.unit, item.quantity);
    if (qtyError) {
      errors.push(
        `Línea ${index + 1} («${product.name}»): ${QUANTITY_MESSAGES[qtyError]}`,
      );
      return;
    }
    const milli = toMilli(item.quantity);
    lines.push({
      productId: product.id,
      name: product.name,
      unit: product.unit,
      quantity: fromMilli(milli),
      unitPrice: product.price,
      subtotal: lineSubtotal(milli, product.price),
    });
  });
  if (errors.length > 0) return { ok: false, kind: 'INVALID', errors };

  const requested = aggregateByProduct(
    lines.map((l) => ({
      productId: l.productId,
      quantityMilli: toMilli(l.quantity),
    })),
  );
  const stock = new Map(
    products.map((p) => [p.id, { name: p.name, stockMilli: toMilli(p.stock) }]),
  );
  const shortages = findShortages(requested, stock);
  if (shortages.length > 0) return { ok: false, kind: 'STOCK', shortages };

  return {
    ok: true,
    plan: {
      lines,
      discounts: [...requested].map(([productId, milli]) => ({
        productId,
        quantity: fromMilli(milli),
      })),
      total: saleTotal(lines.map((l) => l.subtotal)),
    },
  };
}
