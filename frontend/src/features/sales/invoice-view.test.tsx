import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { mockFetch } from '@/test/mock-fetch';
import { InvoiceView } from './invoice-view';

const sale = {
  id: 's1',
  invoiceNumber: 'DR-100',
  status: 'VOIDED',
  voidReason: 'Cobro duplicado',
  reissuedAs: { id: 's2', invoiceNumber: 'DR-101' },
  paymentMethod: 'TRANSFER',
  total: 7500,
  createdAt: '2026-11-27T15:00:00Z',
  customerEmail: 'cliente@correo.test',
  user: { id: 'u-v', name: 'Carlos' },
  items: [{ id: 'i1', productId: 'p1', quantity: 3, unit: 'UNIT', unitPrice: 2500, subtotal: 7500, product: { name: 'Arroz' } }]
};

describe('InvoiceView (SWR-INV-002)', () => {
  test('RTL-MT-22: la factura muestra empresa, NIT, consecutivo, vendedor, detalle y el sello de anulada', async () => {
    mockFetch({
      'GET /api/backend/sales/s1/emails': () => ({ body: [] }),
      'GET /api/backend/sales/s1/invoice': () => ({
        body: {
          sale,
          company: { tradeName: 'Tienda Doña Rosa', legalName: null, taxId: '900123456-8', email: 'ventas@donarosa.test', phone: '3001234567', address: null, city: 'Neiva', logoUrl: null, invoiceFooter: 'Gracias por su compra' }
        }
      })
    });
    render(<InvoiceView id='s1' />);
    expect(await screen.findByRole('heading', { name: 'Tienda Doña Rosa' })).toBeVisible();
    expect(screen.getByText('NIT 900123456-8')).toBeVisible();
    expect(screen.getByText('DR-100')).toBeVisible();
    expect(screen.getByText('Carlos')).toBeVisible();
    expect(screen.getByText('Transferencia')).toBeVisible();
    expect(screen.getByText('cliente@correo.test')).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent(/factura anulada · cobro duplicado/i);
    expect(screen.getByRole('status')).toHaveTextContent(/reemplazada por dr-101/i);
    expect(screen.getByText('Gracias por su compra')).toBeVisible();
  });
});
