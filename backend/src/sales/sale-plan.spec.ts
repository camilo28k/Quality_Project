import { planSale, ProductSnapshot } from './sale-plan';

const arroz: ProductSnapshot = {
  id: 'p1',
  name: 'Arroz',
  unit: 'UNIT',
  price: 2500,
  stock: 10,
  active: true,
};
const queso: ProductSnapshot = {
  id: 'p2',
  name: 'Queso',
  unit: 'KG',
  price: 12999,
  stock: 2,
  active: true,
};

describe('planSale — caja blanca (FAL-01; SWR-SALE-003/004/005/007, SWR-MED-002)', () => {
  it('camino OK: líneas con precio aplicado, subtotales, total y descuento por producto', () => {
    const r = planSale(
      [
        { productId: 'p1', quantity: 3 },
        { productId: 'p2', quantity: 0.75 },
      ],
      [arroz, queso],
    );
    expect(r).toEqual({
      ok: true,
      plan: {
        lines: [
          {
            productId: 'p1',
            name: 'Arroz',
            unit: 'UNIT',
            quantity: 3,
            unitPrice: 2500,
            subtotal: 7500,
          },
          {
            productId: 'p2',
            name: 'Queso',
            unit: 'KG',
            quantity: 0.75,
            unitPrice: 12999,
            subtotal: 9749,
          },
        ],
        discounts: [
          { productId: 'p1', quantity: 3 },
          { productId: 'p2', quantity: 0.75 },
        ],
        total: 17249,
      },
    });
  });

  it('AJ-04: líneas repetidas se suman en un solo descuento', () => {
    const r = planSale(
      [
        { productId: 'p1', quantity: 2 },
        { productId: 'p1', quantity: 3 },
      ],
      [arroz],
    );
    expect(r.ok && r.plan.discounts).toEqual([
      { productId: 'p1', quantity: 5 },
    ]);
    expect(r.ok && r.plan.lines).toHaveLength(2);
  });

  it('camino INVALID: producto inexistente o inactivo', () => {
    const r = planSale(
      [
        { productId: 'px', quantity: 1 },
        { productId: 'p1', quantity: 1 },
      ],
      [{ ...arroz, active: false }],
    );
    expect(r).toEqual({
      ok: false,
      kind: 'INVALID',
      errors: [
        'Línea 1: el producto no está disponible',
        'Línea 2: el producto no está disponible',
      ],
    });
  });

  it('camino INVALID: cantidad decimal en producto por unidad', () => {
    const r = planSale([{ productId: 'p1', quantity: 1.5 }], [arroz]);
    expect(r).toMatchObject({ ok: false, kind: 'INVALID' });
  });

  it('camino STOCK: stock 2, pedir 3 (TC-SALE-002); frontera: pedir exactamente el stock es válido', () => {
    expect(planSale([{ productId: 'p2', quantity: 3 }], [queso])).toMatchObject(
      {
        ok: false,
        kind: 'STOCK',
        shortages: [
          { productId: 'p2', availableMilli: 2000, requestedMilli: 3000 },
        ],
      },
    );
    expect(planSale([{ productId: 'p2', quantity: 2 }], [queso]).ok).toBe(true);
  });
});
