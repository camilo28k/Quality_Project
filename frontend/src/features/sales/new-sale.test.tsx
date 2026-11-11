import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { jsonBody, mockFetch } from '@/test/mock-fetch';
import { NewSale } from './new-sale';

const products = [
  { id: 'p1', name: 'Arroz', unit: 'UNIT', price: 2500, stock: 10, minStock: 1, active: true, lowStock: false },
  { id: 'p2', name: 'Queso', unit: 'KG', price: 12999, stock: 2, minStock: 1, active: true, lowStock: false }
];

async function addLine(productName: string, quantity: string) {
  await userEvent.selectOptions(screen.getByLabelText(/^producto$/i), screen.getByRole('option', { name: new RegExp(`^${productName}`) }));
  await userEvent.type(screen.getByLabelText(/^cantidad/i), quantity);
  await userEvent.click(screen.getByRole('button', { name: /agregar a la venta/i }));
}

const money = (text: string) => text.replace(/\s/g, ' ');

describe('NewSale', () => {
  test('RTL-10: calcula subtotales y total con unidades y kg (SWR-SALE-003/004, SWR-MED-002)', async () => {
    mockFetch({ 'GET /api/backend/products': () => ({ body: products }) });
    render(<NewSale />);
    await screen.findByLabelText(/^producto$/i);

    await addLine('Arroz', '3');
    await addLine('Queso', '0,75');

    const queso = screen.getByRole('cell', { name: 'Queso' }).closest('tr')!;
    expect(money(within(queso).getByText(/0,75 kg/).textContent!)).toBe('0,75 kg');
    expect(money(within(queso).getAllByRole('cell')[3].textContent!)).toBe('$ 9.749'); // 0,75 × 12.999 = 9.749,25
    expect(money(screen.getByTestId('sale-total').textContent!)).toBe('$ 17.249');
  });

  test('RTL-11: rechaza cantidad decimal en producto por unidad y cantidad cero', async () => {
    mockFetch({ 'GET /api/backend/products': () => ({ body: products }) });
    render(<NewSale />);
    await screen.findByLabelText(/^producto$/i);

    await addLine('Arroz', '1,5');
    expect(screen.getByText(/solo admiten cantidades enteras/i)).toBeVisible();

    await userEvent.clear(screen.getByLabelText(/^cantidad/i));
    await userEvent.type(screen.getByLabelText(/^cantidad/i), '0');
    await userEvent.click(screen.getByRole('button', { name: /agregar a la venta/i }));
    expect(screen.getByText(/debe ser mayor que cero/i)).toBeVisible();
    expect(screen.getByRole('button', { name: /confirmar venta/i })).toBeDisabled();
  });

  test('RTL-12: muestra el motivo cuando el servidor rechaza por stock insuficiente (SWR-SALE-007)', async () => {
    mockFetch({
      'GET /api/backend/products': () => ({ body: products }),
      'POST /api/backend/sales': () => ({
        status: 409,
        body: { message: ['Stock insuficiente para «Arroz»: disponible 2, solicitado 3'] }
      })
    });
    render(<NewSale />);
    await screen.findByLabelText(/^producto$/i);
    await addLine('Arroz', '3');

    await userEvent.click(screen.getByRole('button', { name: /confirmar venta/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/no se pudo confirmar la venta/i);
    expect(alert).toHaveTextContent('disponible 2, solicitado 3');
    expect(screen.getByRole('cell', { name: 'Arroz' })).toBeVisible(); // el carrito se conserva para corregir
  });

  test('RTL-13: doble clic en confirmar envía una sola solicitud con clave de idempotencia (SWR-SALE-010)', async () => {
    let resolveSale: (v: { status?: number; body: unknown }) => void = () => {};
    const fetchMock = mockFetch({
      'GET /api/backend/products': () => ({ body: products }),
      'POST /api/backend/sales': () => new Promise((r) => (resolveSale = r))
    });
    render(<NewSale />);
    await screen.findByLabelText(/^producto$/i);
    await addLine('Arroz', '2');

    const confirm = screen.getByRole('button', { name: /confirmar venta/i });
    await userEvent.dblClick(confirm);

    expect(confirm).toBeDisabled();
    const posts = fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST');
    expect(posts).toHaveLength(1);
    const body = jsonBody(posts[0][1]);
    expect(body.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(body).toMatchObject({ paymentMethod: 'CASH', items: [{ productId: 'p1', quantity: 2 }] });

    resolveSale({
      status: 201,
      body: { replayed: false, sale: { id: 's1', total: 5000, paymentMethod: 'CASH', items: [{}] } }
    });
    expect(await screen.findByText(/venta confirmada/i, { selector: '[data-slot="alert-title"]' })).toBeVisible();
    await vi.waitFor(() => expect(screen.queryByRole('cell', { name: 'Arroz' })).not.toBeInTheDocument());
  });
});
