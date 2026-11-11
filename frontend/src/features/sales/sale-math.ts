import type { Unit } from '@/lib/types';

/**
 * Cálculos para mostrar la venta antes de confirmar. Replican las reglas del
 * backend (sale-rules.ts); el valor definitivo siempre lo calcula el servidor.
 */
const SCALE = 1000;

export function quantityError(unit: Unit, quantity: number): string | null {
  if (!Number.isFinite(quantity)) return 'Ingrese una cantidad';
  if (quantity <= 0) return 'La cantidad debe ser mayor que cero';
  if (unit === 'UNIT' && !Number.isInteger(quantity)) return 'Los productos por unidad solo admiten cantidades enteras';
  if (Math.abs(quantity * SCALE - Math.round(quantity * SCALE)) > 1e-6) return 'La cantidad admite máximo 3 decimales';
  return null;
}

export function lineSubtotal(quantity: number, unitPrice: number): number {
  return Math.round((Math.round(quantity * SCALE) * unitPrice) / SCALE);
}

export function total(lines: { quantity: number; unitPrice: number }[]): number {
  return lines.reduce((acc, l) => acc + lineSubtotal(l.quantity, l.unitPrice), 0);
}
