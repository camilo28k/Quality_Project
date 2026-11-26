import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { jsonBody, mockFetch } from '@/test/mock-fetch';
import { SellersManager } from './sellers-manager';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const users = [
  { id: 'a1', name: 'Ana Admin', email: 'ana@t.test', role: 'ADMIN', active: true, mustChangePassword: false },
  { id: 'v1', name: 'Vale Vendedora', email: 'vale@t.test', role: 'SELLER', active: true, mustChangePassword: true }
];

describe('SellersManager (SWR-ROLE-002)', () => {
  test('RTL-MT-08: lista los usuarios con su estado; solo los vendedores tienen acciones', async () => {
    mockFetch({ 'GET /api/backend/users': () => ({ body: users }) });
    render(<SellersManager />);
    const vale = (await screen.findByText('Vale Vendedora')).closest('tr')!;
    expect(within(vale).getByText(/contraseña temporal/i)).toBeVisible();
    expect(within(vale).getByRole('button', { name: /desactivar/i })).toBeVisible();
    const ana = screen.getByText('Ana Admin').closest('tr')!;
    expect(within(ana).queryByRole('button')).not.toBeInTheDocument();
  });

  test('RTL-MT-09: valida el formulario y crea el vendedor con correo normalizado', async () => {
    const fetchMock = mockFetch({
      'GET /api/backend/users': () => ({ body: users }),
      'POST /api/backend/users': () => ({ status: 201, body: { id: 'v2' } })
    });
    render(<SellersManager />);
    await screen.findByText('Vale Vendedora');
    await userEvent.click(screen.getByRole('button', { name: /crear vendedor/i }));
    expect(screen.getByText(/el nombre es obligatorio/i)).toBeVisible();

    await userEvent.type(screen.getByLabelText(/^nombre/i), 'Pedro');
    await userEvent.type(screen.getByLabelText(/^correo/i), ' Pedro@T.test ');
    await userEvent.type(screen.getByLabelText(/contraseña temporal/i), 'Temporal-12345');
    await userEvent.click(screen.getByRole('button', { name: /crear vendedor/i }));

    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')!;
    expect(jsonBody(post[1])).toEqual({ name: 'Pedro', email: 'pedro@t.test', temporaryPassword: 'Temporal-12345' });
  });

  test('RTL-MT-10: muestra el conflicto del servidor si el correo ya existe', async () => {
    mockFetch({
      'GET /api/backend/users': () => ({ body: users }),
      'POST /api/backend/users': () => ({ status: 409, body: { message: 'Ya existe una cuenta con ese correo' } })
    });
    render(<SellersManager />);
    await screen.findByText('Vale Vendedora');
    await userEvent.type(screen.getByLabelText(/^nombre/i), 'Vale');
    await userEvent.type(screen.getByLabelText(/^correo/i), 'vale@t.test');
    await userEvent.type(screen.getByLabelText(/contraseña temporal/i), 'Temporal-12345');
    await userEvent.click(screen.getByRole('button', { name: /crear vendedor/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Ya existe una cuenta con ese correo');
  });
});
