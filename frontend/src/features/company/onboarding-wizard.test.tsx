import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { jsonBody, mockFetch } from '@/test/mock-fetch';
import { OnboardingWizard } from './onboarding-wizard';

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, refresh: vi.fn() }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const next = () => userEvent.click(screen.getByRole('button', { name: /siguiente/i }));

describe('OnboardingWizard (SWR-ONB-001/002)', () => {
  beforeEach(() => replace.mockClear());

  test('RTL-MT-05: no avanza con un NIT de dígito de verificación inválido', async () => {
    mockFetch({});
    render(<OnboardingWizard initialName='Tienda Ana' />);
    expect(screen.getByLabelText(/nombre comercial/i)).toHaveValue('Tienda Ana');
    await userEvent.type(screen.getByLabelText(/^nit/i), '900123456-1');
    await next();
    expect(screen.getByText(/dígito de verificación válido/i)).toBeVisible();
    // Sigue en el paso 1: el campo NIT continúa en pantalla.
    expect(screen.getByLabelText(/^nit/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/correo de la empresa/i)).not.toBeInTheDocument();
  });

  test('RTL-MT-06: recorre los 4 pasos, muestra la vista previa de la factura y envía los datos', async () => {
    const fetchMock = mockFetch({
      'POST /api/backend/company/onboarding': () => ({ body: { id: 'co1', onboardingCompleted: true } })
    });
    render(<OnboardingWizard initialName='Tienda Ana' />);
    await userEvent.type(screen.getByLabelText(/^nit/i), '900123456-8');
    await next();
    await userEvent.type(screen.getByLabelText(/correo de la empresa/i), 'Ventas@Ana.test');
    await next();
    const prefix = screen.getByLabelText(/prefijo/i);
    await userEvent.clear(prefix);
    await userEvent.type(prefix, 'tnd-');
    const first = screen.getByLabelText(/consecutivo inicial/i);
    await userEvent.clear(first);
    await userEvent.type(first, '120');
    expect(screen.getByText('TND-120')).toBeVisible();
    await next();
    expect(screen.getByText('900123456-8')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: /confirmar y empezar/i }));

    const body = jsonBody(fetchMock.mock.calls[0][1]);
    expect(body).toMatchObject({
      tradeName: 'Tienda Ana',
      taxId: '900123456-8',
      email: 'Ventas@Ana.test',
      invoicePrefix: 'TND-',
      firstInvoiceNumber: 120
    });
    expect(body).not.toHaveProperty('legalName');
    expect(replace).toHaveBeenCalledWith('/dashboard');
  });

  test('RTL-MT-07: el correo es obligatorio en el paso de contacto', async () => {
    mockFetch({});
    render(<OnboardingWizard initialName='Tienda Ana' />);
    await userEvent.type(screen.getByLabelText(/^nit/i), '900123456-8');
    await next();
    await next();
    expect(screen.getByText(/correo de la empresa debe ser válido/i)).toBeVisible();
  });
});
