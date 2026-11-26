import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { jsonBody, mockFetch } from '@/test/mock-fetch';
import { ChangePasswordForm } from './change-password-form';

const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, refresh: vi.fn(), push: vi.fn(), back: vi.fn() })
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const fill = async (current: string, next: string, confirm = next) => {
  await userEvent.type(screen.getByLabelText(/contraseña temporal|contraseña actual/i), current);
  await userEvent.type(screen.getByLabelText(/^nueva contraseña/i), next);
  await userEvent.type(screen.getByLabelText(/confirmar/i), confirm);
  await userEvent.click(screen.getByRole('button', { name: /cambiar contraseña/i }));
};

describe('ChangePasswordForm (SWR-ONB-001)', () => {
  beforeEach(() => replace.mockClear());

  test('RTL-MT-01: con contraseña temporal avisa que es obligatorio y pide la temporal', () => {
    mockFetch({});
    render(<ChangePasswordForm mandatory />);
    expect(screen.getByText(/contraseña temporal\. cámbiala para continuar/i)).toBeVisible();
    expect(screen.getByLabelText(/contraseña temporal/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /cancelar/i })).not.toBeInTheDocument();
  });

  test('RTL-MT-02: valida política, coincidencia y que sea distinta, sin llamar a la API', async () => {
    const fetchMock = mockFetch({});
    render(<ChangePasswordForm mandatory={false} />);
    await fill('Actual-12345', 'corta', 'otra');
    expect(screen.getByText(/no cumple/i)).toBeVisible();
    expect(screen.getByText(/no coinciden/i)).toBeVisible();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('RTL-MT-03: envía actual y nueva (sin la confirmación) a /auth/change-password y vuelve al panel', async () => {
    const fetchMock = mockFetch({
      'POST /api/backend/auth/change-password': () => ({ body: { changed: true } })
    });
    render(<ChangePasswordForm mandatory />);
    await fill('Temporal-12345', 'Nueva-Clave-678');
    expect(jsonBody(fetchMock.mock.calls[0][1])).toEqual({
      currentPassword: 'Temporal-12345',
      newPassword: 'Nueva-Clave-678'
    });
    expect(replace).toHaveBeenCalledWith('/dashboard');
  });

  test('RTL-MT-04: muestra el error del servidor si la contraseña actual es incorrecta', async () => {
    mockFetch({
      'POST /api/backend/auth/change-password': () => ({
        status: 400,
        body: { message: ['La contraseña actual no es correcta'] }
      })
    });
    render(<ChangePasswordForm mandatory={false} />);
    await fill('Equivocada-1234', 'Nueva-Clave-678');
    expect(await screen.findByRole('alert')).toHaveTextContent('La contraseña actual no es correcta');
    expect(replace).not.toHaveBeenCalled();
  });
});
