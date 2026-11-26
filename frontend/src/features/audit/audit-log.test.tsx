import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { mockFetch } from '@/test/mock-fetch';
import { AuditLogView, describeChange } from './audit-log';

describe('Auditoría (SWR-AUD-001)', () => {
  test('describeChange muestra antes → después o el valor final', () => {
    expect(describeChange({ before: { price: 2000 }, after: { price: 2500 } })).toBe('price: 2000 → 2500');
    expect(describeChange({ before: null, after: { name: 'Café' } })).toBe('name: Café');
    expect(describeChange({ before: { price: 1 }, after: { price: 2, requestId: 'r1' } })).toBe('price: 1 → 2');
    expect(describeChange({ before: { name: 'Café', price: 9000 }, after: null })).toBe('name: Café · price: 9000');
  });

  test('RTL-MT-15: lista las acciones con quién, rol, acción legible y motivo', async () => {
    mockFetch({
      'GET /api/backend/audit': () => ({
        body: {
          items: [
            {
              id: 'a1',
              action: 'STOCK_ADJUSTMENT_OUT',
              entity: 'Product',
              entityId: 'p1',
              before: { stock: 10 },
              after: { stock: 8, quantity: 2 },
              reason: 'Empaque roto',
              role: 'ADMIN',
              userName: 'Rosa',
              createdAt: '2026-11-27T10:00:00Z'
            }
          ],
          nextCursor: null
        }
      })
    });
    render(<AuditLogView />);
    expect(await screen.findByText('Baja de stock')).toBeVisible();
    expect(screen.getByText('Rosa')).toBeVisible();
    expect(screen.getByText('Administrador')).toBeVisible();
    expect(screen.getByText('Empaque roto')).toBeVisible();
    expect(screen.getByText(/stock: 10 → 8/)).toBeVisible();
    expect(screen.queryByRole('button', { name: /cargar más/i })).not.toBeInTheDocument();
  });
});
