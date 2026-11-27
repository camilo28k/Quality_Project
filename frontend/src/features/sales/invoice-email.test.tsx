import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { jsonBody, mockFetch } from '@/test/mock-fetch';
import { InvoiceEmail } from './invoice-email';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe('InvoiceEmail (SWR-MAIL-002)', () => {
  test('RTL-MT-25: muestra el historial (enviado y fallido con motivo) y reintenta al correo indicado', async () => {
    const fetchMock = mockFetch({
      'GET /api/backend/sales/s1/emails': () => ({
        body: [
          { id: 'e2', to: 'cliente@correo.test', kind: 'INVOICE', status: 'SENT', error: null, createdAt: '2026-11-27T10:05:00Z' },
          { id: 'e1', to: 'cliente@correo.test', kind: 'INVOICE', status: 'FAILED', error: 'El correo de la empresa no está verificado', createdAt: '2026-11-27T10:00:00Z' }
        ]
      }),
      'POST /api/backend/sales/s1/send-invoice': () => ({ body: { status: 'SENT', to: 'otro@correo.test' } })
    });
    render(<InvoiceEmail saleId='s1' customerEmail='cliente@correo.test' />);
    const list = await screen.findByRole('list', { name: /historial de envíos/i });
    expect(list).toHaveTextContent('Enviado');
    expect(list).toHaveTextContent(/falló.*no está verificado/i);
    const input = screen.getByLabelText(/correo del cliente/i);
    expect(input).toHaveValue('cliente@correo.test');
    await userEvent.clear(input);
    await userEvent.type(input, 'Otro@Correo.test');
    await userEvent.click(screen.getByRole('button', { name: /^enviar$/i }));
    const post = fetchMock.mock.calls.find(([, i]) => i?.method === 'POST')!;
    expect(jsonBody(post[1])).toEqual({ to: 'otro@correo.test' });
  });

  test('RTL-MT-26: no envía con un correo inválido', async () => {
    const fetchMock = mockFetch({ 'GET /api/backend/sales/s1/emails': () => ({ body: [] }) });
    render(<InvoiceEmail saleId='s1' customerEmail={null} />);
    await userEvent.type(screen.getByLabelText(/correo del cliente/i), 'no-es-correo');
    await userEvent.click(screen.getByRole('button', { name: /^enviar$/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/correo válido/i);
    expect(fetchMock.mock.calls.some(([, i]) => i?.method === 'POST')).toBe(false);
  });
});
