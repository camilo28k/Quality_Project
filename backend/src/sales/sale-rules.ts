/**
 * Reglas de negocio de ventas, sin dependencias de BD ni HTTP.
 * Las cantidades se manejan internamente en milésimas enteras para evitar
 * errores de coma flotante (0,1 + 0,2 ≠ 0,3).
 */
export type UnitCode = 'UNIT' | 'KG' | 'LB';

export const QTY_SCALE = 1000; // 3 decimales (AJ-03)

export type QuantityError =
  | 'NOT_A_NUMBER'
  | 'NOT_POSITIVE'
  | 'UNIT_REQUIRES_INTEGER'
  | 'TOO_MANY_DECIMALS';

export const QUANTITY_MESSAGES: Record<QuantityError, string> = {
  NOT_A_NUMBER: 'La cantidad debe ser un número',
  NOT_POSITIVE: 'La cantidad debe ser mayor que cero',
  UNIT_REQUIRES_INTEGER:
    'Los productos por unidad solo admiten cantidades enteras',
  TOO_MANY_DECIMALS: 'La cantidad admite máximo 3 decimales',
};

/** Convierte una cantidad decimal a milésimas enteras. */
export function toMilli(quantity: number): number {
  return Math.round(quantity * QTY_SCALE);
}

export function fromMilli(milli: number): number {
  return milli / QTY_SCALE;
}

/**
 * SWR-MED-002 (decimales positivos en kg), límite SWR-MED-004 (cantidad > 0).
 * Devuelve null si la cantidad es válida para la unidad del producto.
 */
export function validateQuantity(
  unit: UnitCode,
  quantity: number,
): QuantityError | null {
  if (typeof quantity !== 'number' || !Number.isFinite(quantity))
    return 'NOT_A_NUMBER';
  if (quantity <= 0) return 'NOT_POSITIVE';
  if (unit === 'UNIT') {
    return Number.isInteger(quantity) ? null : 'UNIT_REQUIRES_INTEGER';
  }
  if (Math.abs(quantity * QTY_SCALE - toMilli(quantity)) > 1e-6)
    return 'TOO_MANY_DECIMALS';
  return null;
}

/**
 * SWR-SALE-003: subtotal = cantidad × precio aplicado, en COP enteros (D-04),
 * redondeado al peso más cercano.
 */
export function lineSubtotal(quantityMilli: number, unitPrice: number): number {
  if (!Number.isInteger(quantityMilli) || quantityMilli <= 0)
    throw new Error('Cantidad inválida');
  if (!Number.isInteger(unitPrice) || unitPrice < 0)
    throw new Error('Precio inválido');
  return Math.round((quantityMilli * unitPrice) / QTY_SCALE);
}

/** SWR-SALE-004: total = suma de subtotales. */
export function saleTotal(subtotals: number[]): number {
  return subtotals.reduce((acc, s) => acc + s, 0);
}

/** AJ-04: suma las cantidades de un mismo producto repetido en varias líneas. */
export function aggregateByProduct(
  lines: { productId: string; quantityMilli: number }[],
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const line of lines) {
    totals.set(
      line.productId,
      (totals.get(line.productId) ?? 0) + line.quantityMilli,
    );
  }
  return totals;
}

export interface StockShortage {
  productId: string;
  name: string;
  availableMilli: number;
  requestedMilli: number;
}

/**
 * SWR-SALE-007: identifica los productos cuyo stock no alcanza.
 * Lista vacía = la venta puede confirmarse.
 */
export function findShortages(
  requested: Map<string, number>,
  stock: Map<string, { name: string; stockMilli: number }>,
): StockShortage[] {
  const shortages: StockShortage[] = [];
  for (const [productId, requestedMilli] of requested) {
    const product = stock.get(productId);
    const availableMilli = product?.stockMilli ?? 0;
    if (requestedMilli > availableMilli) {
      shortages.push({
        productId,
        name: product?.name ?? productId,
        availableMilli,
        requestedMilli,
      });
    }
  }
  return shortages;
}

export function shortageMessage(s: StockShortage): string {
  return `Stock insuficiente para «${s.name}»: disponible ${fromMilli(s.availableMilli)}, solicitado ${fromMilli(s.requestedMilli)}`;
}
