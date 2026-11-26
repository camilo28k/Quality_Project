import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { jsonBody, mockFetch } from '@/test/mock-fetch';
import { SalesHistory } from './sales-history';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const line = { id: 'i1', productId: 'p1', quantity: 3, unit: 'UNIT', unitPrice: 2500, subtotal: 7500, product: { name: 'Arroz' } };
const base = {
  id: 's1',
  invoiceNumber: 'DR-100',
  status: 'CONFIRMED',
  paymentMethod: 'CASH',
  total: 7500,
  createdAt: '2026-11-27T15:00:00Z',
  items: [line],
  userId: 'u-v',
  user: { id: 'u-v', name: 'Carlos' },
  correctionRequests: []
};

describe('SalesHistory (SWR-INV-001, SWR-SALE-V01/V02/V03)', () => {
  test('RTL-MT-18: muestra la factura, la anulada tachada con su reemisión, y acciones solo para el ADMIN', async () => {
    mockFetch({
      'GET /api/backend/sales': () => ({
        body: [
          base,
          { ...base, id: 's0', invoiceNumber: 'DR-99', status: 'VOIDED', reissuedAs: { id: 's1', invoiceNumber: 'DR-100' } }
        ]
      })
    });
    render(<SalesHistory role='ADMIN' userId='u-a' />);
    const voided = (await screen.findByText('DR-99')).closest('tr')!;
    expect(within(voided).getByText('Anulada')).toBeVisible();
    expect(within(voided).getByText(/reemitida como dr-100/i)).toBeVisible();
    expect(within(voided).queryByRole('button', { name: /anular/i })).not.toBeInTheDocument();
    const ok = screen.getAllByText('DR-100')[0].closest('tr')!;
    expect(within(ok).getByRole('button', { name: /reemitir/i })).toBeVisible();
    expect(within(ok).getByRole('button', { name: /anular/i })).toBeVisible();
  });

  test('RTL-MT-19: anular exige motivo y lo envía', async () => {
    const fetchMock = mockFetch({
      'GET /api/backend/sales': () => ({ body: [base] }),
      'POST /api/backend/sales/s1/void': () => ({ body: { ...base, status: 'VOIDED' } })
    });
    render(<SalesHistory role='ADMIN' userId='u-a' />);
    await userEvent.click(await screen.findByRole('button', { name: /^anular$/i }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: /anular venta/i }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent(/motivo es obligatorio/i);
    await userEvent.type(within(dialog).getByLabelText(/motivo/i), 'Cobro duplicado');
    await userEvent.click(within(dialog).getByRole('button', { name: /anular venta/i }));
    const post = await vi.waitFor(() => {
      const c = fetchMock.mock.calls.find(([, i]) => i?.method === 'POST');
      if (!c) throw new Error('sin POST');
      return c;
    });
    expect(jsonBody(post[1])).toEqual({ reason: 'Cobro duplicado' });
  });

  test('RTL-MT-20: reemitir envía las cantidades corregidas, el motivo y muestra el nuevo total', async () => {
    const fetchMock = mockFetch({
      'GET /api/backend/sales': () => ({ body: [base] }),
      'POST /api/backend/sales/s1/reissue': () => ({ status: 201, body: { sale: { ...base, id: 's2', invoiceNumber: 'DR-101' } } })
    });
    render(<SalesHistory role='ADMIN' userId='u-a' />);
    await userEvent.click(await screen.findByRole('button', { name: /reemitir/i }));
    const dialog = await screen.findByRole('dialog');
    const q = within(dialog).getByLabelText(/arroz/i);
    await userEvent.clear(q);
    await userEvent.type(q, '2');
    expect(within(dialog).getByText(/→/)).toHaveTextContent(/5\.000/);
    await userEvent.type(within(dialog).getByLabelText(/motivo de la corrección/i), 'Eran 2');
    await userEvent.click(within(dialog).getByRole('button', { name: /anular y reemitir/i }));
    const post = await vi.waitFor(() => {
      const c = fetchMock.mock.calls.find(([, i]) => i?.method === 'POST');
      if (!c) throw new Error('sin POST');
      return c;
    });
    expect(jsonBody(post[1])).toMatchObject({
      reason: 'Eran 2',
      paymentMethod: 'CASH',
      items: [{ productId: 'p1', quantity: 2 }]
    });
  });

  test('RTL-MT-21: el vendedor solo puede pedir corrección de sus ventas confirmadas y sin solicitud pendiente', async () => {
    mockFetch({
      'GET /api/backend/sales': () => ({
        body: [base, { ...base, id: 's3', invoiceNumber: 'DR-102', correctionRequests: [{ id: 'c1', reason: 'x', createdAt: '', requestedById: 'u-v' }] }]
      })
    });
    render(<SalesHistory role='SELLER' userId='u-v' />);
    const mine = (await screen.findByText('DR-100')).closest('tr')!;
    expect(within(mine).getByRole('button', { name: /pedir corrección/i })).toBeVisible();
    expect(within(mine).queryByRole('button', { name: /anular|reemitir/i })).not.toBeInTheDocument();
    const pending = screen.getByText('DR-102').closest('tr')!;
    expect(within(pending).getByText(/corrección pedida/i)).toBeVisible();
    expect(within(pending).queryByRole('button', { name: /pedir corrección/i })).not.toBeInTheDocument();
  });
});
