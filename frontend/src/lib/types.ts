export type Unit = 'UNIT' | 'KG' | 'LB';
export type PaymentMethod = 'CASH' | 'CARD' | 'TRANSFER';

export interface Category {
  id: string;
  name: string;
  active?: boolean;
  _count?: { products: number };
}

export interface Product {
  id: string;
  name: string;
  categoryId: string;
  category?: Category;
  unit: Unit;
  cost: number;
  price: number;
  stock: number;
  minStock: number;
  active: boolean;
  lowStock: boolean;
  description?: string | null;
  /** false: lo creó un vendedor y espera aprobación del ADMIN (no se vende). */
  approved?: boolean;
  createdById?: string | null;
}

export interface SaleItem {
  id: string;
  productId: string;
  quantity: number;
  unit: Unit;
  unitPrice: number;
  subtotal: number;
  product?: { name: string };
}

export type SaleStatus = 'CONFIRMED' | 'VOIDED';

export interface Sale {
  id: string;
  /** SWR-INV-001: prefijo + consecutivo de la empresa */
  invoiceNumber: string;
  status: SaleStatus;
  paymentMethod: PaymentMethod;
  total: number;
  createdAt: string;
  items: SaleItem[];
  userId?: string;
  user?: { id: string; name: string };
  customerEmail?: string | null;
  voidedAt?: string | null;
  voidReason?: string | null;
  correctsSale?: { id: string; invoiceNumber: string } | null;
  reissuedAs?: { id: string; invoiceNumber: string } | null;
  correctionRequests?: { id: string; reason: string; createdAt: string; requestedById: string }[];
}

export const UNIT_LABEL: Record<Unit, string> = { UNIT: 'unidad', KG: 'kg', LB: 'lb' };

export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  CASH: 'Efectivo',
  CARD: 'Tarjeta',
  TRANSFER: 'Transferencia'
};
