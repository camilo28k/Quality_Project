import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { jsonBody, mockFetch } from '@/test/mock-fetch';
import { LoginForm } from './login-form';

const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, refresh: vi.fn(), push: vi.fn() })
}));

describe('LoginForm (SWR-AUTH-001, SWR-AUTH-002)', () => {
  beforeEach(() => replace.mockClear());

  test('RTL-01: muestra los campos obligatorios si se envía vacío', async () => {
    const fetchMock = mockFetch({});
    render(<LoginForm />);

    await userEvent.click(screen.getByRole('button', { name: /ingresar/i }));

    expect(screen.getByText(/el correo es obligatorio/i)).toBeVisible();
    expect(screen.getByText(/la contraseña es obligatoria/i)).toBeVisible();
    expect(screen.getByLabelText(/correo electrónico/i)).toHaveAttribute('aria-invalid', 'true');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('RTL-02: con credenciales incorrectas muestra el mensaje general y no navega', async () => {
    mockFetch({
      'POST /api/auth/login': () => ({ status: 401, body: { message: 'Correo o contraseña incorrectos' } })
    });
    render(<LoginForm />);

    await userEvent.type(screen.getByLabelText(/correo electrónico/i), 'admin@tiendapp.test');
    await userEvent.type(screen.getByLabelText(/contraseña/i), 'incorrecta');
    await userEvent.click(screen.getByRole('button', { name: /ingresar/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Correo o contraseña incorrectos');
    expect(replace).not.toHaveBeenCalled();
  });

  test('RTL-03: con credenciales válidas envía el correo normalizado y entra al panel', async () => {
    const fetchMock = mockFetch({
      'POST /api/auth/login': () => ({ body: { user: { id: 'u1', role: 'ADMIN' } } })
    });
    render(<LoginForm />);

    await userEvent.type(screen.getByLabelText(/correo electrónico/i), '  admin@tiendapp.test ');
    await userEvent.type(screen.getByLabelText(/contraseña/i), 'Clave123!');
    await userEvent.click(screen.getByRole('button', { name: /ingresar/i }));

    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith('/dashboard'));
    expect(jsonBody(fetchMock.mock.calls[0][1])).toEqual({ email: 'admin@tiendapp.test', password: 'Clave123!' });
  });
});
