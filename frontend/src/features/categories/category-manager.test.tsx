import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { jsonBody, mockFetch } from '@/test/mock-fetch';
import { CategoryManager } from './category-manager';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const cats = [
  { id: 'c1', name: 'Granos', active: true, _count: { products: 3 } },
  { id: 'c2', name: 'Vacía', active: false, _count: { products: 0 } }
];

describe('CategoryManager (SWR-CAT-D01)', () => {
  test('RTL-MT-16: una categoría con productos no se puede eliminar; la inactiva se puede activar', async () => {
    mockFetch({ 'GET /api/backend/categories?includeInactive=true': () => ({ body: cats }) });
    render(<CategoryManager />);
    const granos = (await screen.findByText('Granos')).closest('tr')!;
    expect(within(granos).getByRole('button', { name: /eliminar/i })).toBeDisabled();
    const vacia = screen.getByText('Vacía').closest('tr')!;
    expect(within(vacia).getByText(/inactiva/i)).toBeVisible();
    expect(within(vacia).getByRole('button', { name: /^activar$/i })).toBeVisible();
    expect(within(vacia).getByRole('button', { name: /eliminar/i })).toBeEnabled();
  });

  test('RTL-MT-17: renombrar envía el nombre nuevo', async () => {
    const fetchMock = mockFetch({
      'GET /api/backend/categories?includeInactive=true': () => ({ body: cats }),
      'PATCH /api/backend/categories/c1': () => ({ body: { id: 'c1', name: 'Granos y cereales' } })
    });
    render(<CategoryManager />);
    const row = (await screen.findByText('Granos')).closest('tr')!;
    await userEvent.click(within(row).getByRole('button', { name: /renombrar/i }));
    const input = screen.getByLabelText(/nuevo nombre de granos/i);
    await userEvent.clear(input);
    await userEvent.type(input, 'Granos y cereales');
    await userEvent.click(screen.getByRole('button', { name: /guardar$/i }));
    const patch = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH')!;
    expect(jsonBody(patch[1])).toEqual({ name: 'Granos y cereales' });
  });
});
