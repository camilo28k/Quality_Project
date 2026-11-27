import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { jsonBody, mockFetch } from '@/test/mock-fetch';
import { EmailVerification } from './email-verification';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe('EmailVerification (SWR-MAIL-001)', () => {
  test('RTL-MT-23: pide el código, valida 6 dígitos y verifica', async () => {
    const onVerified = vi.fn();
    const fetchMock = mockFetch({
      'POST /api/backend/company/email/send-code': () => ({ body: { sentTo: 'ventas@rosa.test', expiresInMinutes: 15 } }),
      'POST /api/backend/company/email/verify': () => ({ body: { verified: true } })
    });
    render(<EmailVerification email='ventas@rosa.test' verifiedAt={null} onVerified={onVerified} />);
    await userEvent.click(screen.getByRole('button', { name: /enviar código a ventas@rosa.test/i }));
    const input = await screen.findByLabelText(/código/i);
    await userEvent.type(input, '12a3');
    expect(input).toHaveValue('123');
    await userEvent.click(screen.getByRole('button', { name: /^verificar$/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/6 dígitos/);
    await userEvent.type(input, '456');
    await userEvent.click(screen.getByRole('button', { name: /^verificar$/i }));
    const verify = fetchMock.mock.calls.find(([u]) => String(u).endsWith('/verify'))!;
    expect(jsonBody(verify[1])).toEqual({ code: '123456' });
    expect(onVerified).toHaveBeenCalled();
  });

  test('RTL-MT-24: muestra el error del servidor (código incorrecto) y no se muestra si ya está verificado', async () => {
    mockFetch({
      'POST /api/backend/company/email/send-code': () => ({ body: { sentTo: 'a@b.test', expiresInMinutes: 15 } }),
      'POST /api/backend/company/email/verify': () => ({ status: 400, body: { message: ['Código incorrecto. Le quedan 4 intento(s)'] } })
    });
    const { rerender } = render(<EmailVerification email='a@b.test' verifiedAt={null} onVerified={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /enviar código/i }));
    await userEvent.type(await screen.findByLabelText(/código/i), '000000');
    await userEvent.click(screen.getByRole('button', { name: /^verificar$/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/le quedan 4/i);
    rerender(<EmailVerification email='a@b.test' verifiedAt='2026-11-27T10:00:00Z' onVerified={vi.fn()} />);
    expect(screen.queryByText(/verifica el correo/i)).not.toBeInTheDocument();
  });
});
