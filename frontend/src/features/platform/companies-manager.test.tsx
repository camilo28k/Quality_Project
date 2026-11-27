import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { jsonBody, mockFetch } from '@/test/mock-fetch';
import { CompaniesManager } from './companies-manager';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const companies = [
  { id: 'co1', tradeName: 'Tienda Doña Rosa', email: 'ventas@rosa.test', emailVerifiedAt: '2026-11-27T10:00:00Z', onboardingCompleted: true, active: true, createdAt: '2026-11-26T10:00:00Z', _count: { users: 2, products: 3, sales: 4 } },
  { id: 'co2', tradeName: 'Nueva', email: null, emailVerifiedAt: null, onboardingCompleted: false, active: true, createdAt: '2026-11-27T10:00:00Z', _count: { users: 1, products: 0, sales: 0 } },
  { id: 'co3', tradeName: 'Cerrada', email: null, emailVerifiedAt: null, onboardingCompleted: true, active: false, createdAt: '2026-11-25T10:00:00Z', _count: { users: 1, products: 0, sales: 0 } }
];

const fill = async () => {
  await userEvent.type(screen.getByLabelText(/nombre de la empresa/i), 'Tienda Ana');
  await userEvent.type(screen.getByLabelText(/nombre del administrador/i), 'Ana');
  await userEvent.type(screen.getByLabelText(/correo del administrador/i), ' Ana@Tienda.test ');
  await userEvent.type(screen.getByLabelText(/contraseña temporal/i), 'Temporal-12345');
  await userEvent.click(screen.getByRole('button', { name: /crear empresa/i }));
};

describe('CompaniesManager (SUPER_ADMIN)', () => {
  test('RTL-MT-27: lista las empresas con su estado (activa, configurando, desactivada) y enlace al detalle', async () => {
    mockFetch({ 'GET /api/backend/platform/companies': () => ({ body: companies }) });
    render(<CompaniesManager />);
    const rosa = (await screen.findByRole('link', { name: 'Tienda Doña Rosa' })).closest('tr')!;
    expect(within(rosa).getByText('Activa')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Tienda Doña Rosa' })).toHaveAttribute('href', '/dashboard/empresas/co1');
    expect(within(screen.getByText('Nueva').closest('tr')!).getByText('Configurando')).toBeVisible();
    expect(within(screen.getByText('Cerrada').closest('tr')!).getByText('Desactivada')).toBeVisible();
  });

  test('RTL-MT-28: crea la empresa y luego su ADMIN con correo normalizado', async () => {
    const fetchMock = mockFetch({
      'GET /api/backend/platform/companies': () => ({ body: companies }),
      'POST /api/backend/platform/companies': () => ({ status: 201, body: { id: 'co9' } }),
      'POST /api/backend/platform/companies/co9/admin': () => ({ status: 201, body: { id: 'a9' } })
    });
    render(<CompaniesManager />);
    await screen.findByText('Nueva');
    await fill();
    const posts = fetchMock.mock.calls.filter(([, i]) => i?.method === 'POST');
    expect(jsonBody(posts[0][1])).toEqual({ tradeName: 'Tienda Ana' });
    expect(jsonBody(posts[1][1])).toEqual({ name: 'Ana', email: 'ana@tienda.test', temporaryPassword: 'Temporal-12345' });
  });

  test('RTL-MT-29: si la empresa se crea pero el ADMIN falla, lo dice claramente', async () => {
    mockFetch({
      'GET /api/backend/platform/companies': () => ({ body: companies }),
      'POST /api/backend/platform/companies': () => ({ status: 201, body: { id: 'co9' } }),
      'POST /api/backend/platform/companies/co9/admin': () => ({ status: 409, body: { message: 'Ya existe una cuenta con ese correo' } })
    });
    render(<CompaniesManager />);
    await screen.findByText('Nueva');
    await fill();
    expect(await screen.findByRole('alert')).toHaveTextContent(/la empresa se creó, pero no su administrador: ya existe una cuenta/i);
  });
});
