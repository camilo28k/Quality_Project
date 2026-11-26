import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { mockFetch } from '@/test/mock-fetch';
import { ProductsView } from './products-view';

const arroz = {
  id: 'p1',
  name: 'Arroz',
  categoryId: 'c1',
  category: { id: 'c1', name: 'Granos' },
  unit: 'UNIT',
  cost: 1800,
  price: 2500,
  stock: 3,
  minStock: 5,
  active: true,
  lowStock: true
};

describe('ProductsView', () => {
  test('RTL-07: muestra estado de carga y luego los productos con su stock', async () => {
    let release: () => void = () => {};
    const pending = new Promise<void>((r) => (release = r));
    mockFetch({
      'GET /api/backend/products': async () => {
        await pending;
        return { body: [arroz] };
      },
      'GET /api/backend/categories': () => ({ body: [] })
    });
    render(<ProductsView role='SELLER' />);

    expect(screen.getByRole('status', { name: /cargando productos/i })).toBeInTheDocument();
    release();

    const row = (await screen.findByRole('cell', { name: 'Arroz' })).closest('tr')!;
    expect(within(row).getByText('3 unidad')).toBeVisible();
    expect(within(row).getByText(/stock bajo/i)).toBeVisible();
  });

  test('RTL-08: muestra mensaje de lista vacía', async () => {
    mockFetch({
      'GET /api/backend/products': () => ({ body: [] }),
      'GET /api/backend/categories': () => ({ body: [] })
    });
    render(<ProductsView role='SELLER' />);

    expect(await screen.findByText(/aún no hay productos registrados/i)).toBeVisible();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  test('RTL-09: desactivar exige confirmación antes de llamar a la API (SWR-PROD-005)', async () => {
    const fetchMock = mockFetch({
      'GET /api/backend/products?includeInactive=true': () => ({ body: [arroz] }),
      'GET /api/backend/categories': () => ({ body: [] }),
      'PATCH /api/backend/products/p1/deactivate': () => ({ body: { ...arroz, active: false } })
    });
    render(<ProductsView role='ADMIN' />);

    await userEvent.click(await screen.findByRole('button', { name: /^desactivar$/i }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/¿desactivar «arroz»\?/i)).toBeVisible();
    const patchCalls = () => fetchMock.mock.calls.filter(([, init]) => init?.method === 'PATCH');
    expect(patchCalls()).toHaveLength(0);

    await userEvent.click(within(dialog).getByRole('button', { name: /desactivar/i }));

    await vi.waitFor(() => expect(patchCalls()).toHaveLength(1));
  });

  test('RTL-MT-11: el vendedor ve su producto pendiente y no tiene desactivar ni eliminar (SWR-ROLE-003)', async () => {
    mockFetch({
      'GET /api/backend/products': () => ({ body: [{ ...arroz, approved: false }] }),
      'GET /api/backend/categories': () => ({ body: [] })
    });
    render(<ProductsView role='SELLER' />);
    const row = (await screen.findByRole('cell', { name: /arroz/i })).closest('tr')!;
    expect(within(row).getByText(/pendiente de aprobación/i)).toBeVisible();
    expect(within(row).getByRole('button', { name: /editar/i })).toBeVisible();
    expect(within(row).queryByRole('button', { name: /desactivar|eliminar/i })).not.toBeInTheDocument();
    expect(screen.getByText(/quedará pendiente hasta que el administrador/i)).toBeVisible();
  });

  test('RTL-MT-12: la baja de stock exige motivo y envía la cantidad (SWR-STK-001)', async () => {
    const fetchMock = mockFetch({
      'GET /api/backend/products?includeInactive=true': () => ({ body: [{ ...arroz, stock: 10 }] }),
      'GET /api/backend/categories': () => ({ body: [] }),
      'POST /api/backend/products/p1/stock-adjustments': () => ({ status: 201, body: { ...arroz, stock: 8 } })
    });
    render(<ProductsView role='ADMIN' />);
    await userEvent.click(await screen.findByRole('button', { name: /^stock$/i }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.selectOptions(within(dialog).getByLabelText(/tipo de movimiento/i), 'out');
    await userEvent.type(within(dialog).getByLabelText(/cantidad/i), '2');
    await userEvent.click(within(dialog).getByRole('button', { name: /registrar/i }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent(/motivo es obligatorio/i);

    await userEvent.type(within(dialog).getByLabelText(/motivo/i), 'Empaque roto');
    await userEvent.click(within(dialog).getByRole('button', { name: /registrar/i }));
    const post = await vi.waitFor(() => {
      const c = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
      if (!c) throw new Error('sin POST');
      return c;
    });
    expect(JSON.parse(String(post[1]?.body))).toEqual({ quantity: 2, reason: 'Empaque roto' });
  });
});
