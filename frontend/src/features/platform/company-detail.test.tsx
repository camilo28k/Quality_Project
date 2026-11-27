import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { jsonBody, mockFetch } from '@/test/mock-fetch';
import { CompanyDetail } from './company-detail';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const detail = {
  id: 'co1',
  tradeName: 'Tienda Doña Rosa',
  legalName: null,
  taxId: '900123456-8',
  email: 'ventas@rosa.test',
  emailVerifiedAt: '2026-11-27T10:00:00Z',
  city: 'Neiva',
  invoicePrefix: 'DR-',
  nextInvoiceNumber: 103,
  onboardingCompleted: true,
  active: true,
  createdAt: '2026-11-26T10:00:00Z',
  users: [
    { id: 'a1', name: 'Rosa', email: 'rosa@demo.test', role: 'ADMIN', active: true },
    { id: 'v1', name: 'Carlos', email: 'carlos@demo.test', role: 'SELLER', active: true }
  ],
  stats: { confirmedSales: 2, salesTotal: 22500 }
};
const routes = (extra = {}) => ({
  'GET /api/backend/platform/companies/co1': () => ({ body: detail }),
  'GET /api/backend/audit?companyId=co1': () => ({ body: { items: [], nextCursor: null } }),
  ...extra
});

describe('CompanyDetail (SUPER_ADMIN)', () => {
  test('RTL-MT-30: muestra ventas, próxima factura y usuarios; desactivar pide confirmación', async () => {
    const fetchMock = mockFetch(
      routes({ 'PATCH /api/backend/platform/companies/co1/deactivate': () => ({ body: { ...detail, active: false } }) })
    );
    render(<CompanyDetail id='co1' />);
    expect(await screen.findByText('DR-103')).toBeVisible();
    expect(screen.getByText(/total \$\s?22\.500/i)).toBeVisible();
    expect(screen.getByText('Carlos')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: /desactivar empresa/i }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent(/sus 2 usuario\(s\) no podrán iniciar sesión/i);
    expect(fetchMock.mock.calls.some(([, i]) => i?.method === 'PATCH')).toBe(false);
    await userEvent.click(within(dialog).getByRole('button', { name: /^desactivar$/i }));
    await vi.waitFor(() => expect(fetchMock.mock.calls.some(([, i]) => i?.method === 'PATCH')).toBe(true));
  });

  test('RTL-MT-31: restablece la contraseña de un usuario con una temporal válida', async () => {
    const fetchMock = mockFetch(
      routes({ 'POST /api/backend/platform/companies/users/v1/reset-password': () => ({ body: { reset: true } }) })
    );
    render(<CompanyDetail id='co1' />);
    const row = (await screen.findByText('Carlos')).closest('tr')!;
    await userEvent.click(within(row).getByRole('button', { name: /restablecer contraseña/i }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText(/contraseña temporal/i), 'corta');
    await userEvent.click(within(dialog).getByRole('button', { name: /^restablecer$/i }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent(/no cumple/i);
    await userEvent.clear(within(dialog).getByLabelText(/contraseña temporal/i));
    await userEvent.type(within(dialog).getByLabelText(/contraseña temporal/i), 'Temporal-55555');
    await userEvent.click(within(dialog).getByRole('button', { name: /^restablecer$/i }));
    const post = await vi.waitFor(() => {
      const c = fetchMock.mock.calls.find(([, i]) => i?.method === 'POST');
      if (!c) throw new Error('sin POST');
      return c;
    });
    expect(jsonBody(post[1])).toEqual({ temporaryPassword: 'Temporal-55555' });
  });
});
