export type Unit = 'UNIT' | 'KG' | 'LB';
export type PaymentMethod = 'CASH' | 'CARD' | 'TRANSFER';

export interface Category {
  id: string;
  name: string;
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

export interface Sale {
  id: string;
  paymentMethod: PaymentMethod;
  total: number;
  createdAt: string;
  items: SaleItem[];
  user?: { id: string; name: string };
}

export const UNIT_LABEL: Record<Unit, string> = { UNIT: 'unidad', KG: 'kg', LB: 'lb' };

export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  CASH: 'Efectivo',
  CARD: 'Tarjeta',
  TRANSFER: 'Transferencia'
};
