import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { jsonBody, mockFetch } from '@/test/mock-fetch';
import { ReviewPanel } from './review-panel';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const review = {
  pendingProducts: [
    { id: 'p9', name: 'Café', price: 9000, category: { id: 'c1', name: 'Granos' }, createdByName: 'Carlos', approved: false }
  ],
  priceRequests: [
    { id: 'r1', currentPrice: 2000, proposedPrice: 2500, reason: 'Subió el proveedor', createdAt: '2026-11-27T10:00:00Z', requestedByName: 'Carlos', product: { id: 'p1', name: 'Arroz' } }
  ],
  recentPriceChanges: [
    { id: 'a1', productName: 'Arroz', before: { price: 1800 }, after: { price: 2000 }, userName: 'Rosa', createdAt: '2026-11-26T10:00:00Z' }
  ]
};

describe('ReviewPanel (decisión a, SWR-ROLE-003)', () => {
  test('RTL-MT-13: aprueba el producto del vendedor con el precio final que fija el ADMIN', async () => {
    const fetchMock = mockFetch({
      'GET /api/backend/review': () => ({ body: review }),
      'POST /api/backend/products/p9/approve': () => ({ body: {} })
    });
    render(<ReviewPanel />);
    const price = await screen.findByLabelText(/precio final de café/i);
    await userEvent.clear(price);
    await userEvent.type(price, '8500');
    const row = price.closest('tr')!;
    await userEvent.click(within(row).getByRole('button', { name: /aprobar/i }));
    const post = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/approve'))!;
    expect(jsonBody(post[1])).toEqual({ price: 8500 });
  });

  test('RTL-MT-14: muestra la solicitud de precio con actual → propuesto y permite rechazarla', async () => {
    const fetchMock = mockFetch({
      'GET /api/backend/review': () => ({ body: review }),
      'POST /api/backend/price-requests/r1/reject': () => ({ body: { status: 'REJECTED' } })
    });
    render(<ReviewPanel />);
    const row = (await screen.findByText('Subió el proveedor')).closest('tr')!;
    expect(row).toHaveTextContent(/2\.000.*→.*2\.500/);
    await userEvent.click(within(row).getByRole('button', { name: /rechazar/i }));
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/r1/reject'))).toBe(true);
    expect(screen.getByText('Rosa')).toBeVisible();
  });
});
