import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { jsonBody, mockFetch } from '@/test/mock-fetch';
import { ProductForm } from './product-form';

const categories = [{ id: 'c1', name: 'Granos' }];

async function fill(values: Record<string, string>) {
  for (const [label, value] of Object.entries(values)) {
    const el = screen.getByLabelText(new RegExp(label, 'i'));
    if (el.tagName === 'SELECT') await userEvent.selectOptions(el, value);
    else await userEvent.type(el, value);
  }
}

describe('ProductForm (SWR-PROD-001)', () => {
  test('RTL-04: identifica cada campo obligatorio faltante', async () => {
    const fetchMock = mockFetch({});
    render(<ProductForm categories={categories} onCreated={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: /guardar producto/i }));

    expect(screen.getByText(/el nombre es obligatorio/i)).toBeVisible();
    expect(screen.getByText(/la categoría es obligatoria/i)).toBeVisible();
    expect(screen.getByText(/el precio es obligatorio/i)).toBeVisible();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('RTL-05: rechaza stock decimal en producto por unidad', async () => {
    mockFetch({});
    render(<ProductForm categories={categories} onCreated={vi.fn()} />);

    await fill({
      '^nombre': 'Arroz',
      'categoría': 'c1',
      'unidad de medida': 'UNIT',
      'costo': '1800',
      'precio de venta': '2500',
      'stock inicial': '1.5',
      'stock mínimo': '2'
    });
    await userEvent.click(screen.getByRole('button', { name: /guardar producto/i }));

    expect(screen.getByText(/solo admiten cantidades enteras/i)).toBeVisible();
  });

  test('RTL-06: registra un producto por kg con decimales y avisa al contenedor', async () => {
    const onCreated = vi.fn();
    const fetchMock = mockFetch({
      'POST /api/backend/products': (init) => ({ status: 201, body: { id: 'p1', ...jsonBody(init) } })
    });
    render(<ProductForm categories={categories} onCreated={onCreated} />);

    await fill({
      '^nombre': 'Queso',
      'categoría': 'c1',
      'unidad de medida': 'KG',
      'costo': '9000',
      'precio de venta': '12000',
      'stock inicial': '2.5',
      'stock mínimo': '0.5'
    });
    await userEvent.click(screen.getByRole('button', { name: /guardar producto/i }));

    await vi.waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(jsonBody(fetchMock.mock.calls[0][1])).toMatchObject({
      name: 'Queso',
      unit: 'KG',
      price: 12000,
      initialStock: 2.5
    });
  });
});
