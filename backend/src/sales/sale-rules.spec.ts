import {
  aggregateByProduct,
  findShortages,
  lineSubtotal,
  saleTotal,
  shortageMessage,
  toMilli,
  validateQuantity,
} from './sale-rules';

describe('validateQuantity — caja blanca (SWR-MED-002, SWR-MED-004)', () => {
  // Caminos: NaN | <= 0 | UNIT entero | UNIT decimal | KG/LB > 3 decimales | KG/LB válido
  it('camino 1: rechaza valores no numéricos', () => {
    expect(validateQuantity('KG', Number.NaN)).toBe('NOT_A_NUMBER');
  });

  it('camino 2 (frontera): rechaza 0 y negativos', () => {
    expect(validateQuantity('UNIT', 0)).toBe('NOT_POSITIVE');
    expect(validateQuantity('KG', -0.5)).toBe('NOT_POSITIVE');
  });

  it('camino 3: acepta enteros para productos por unidad', () => {
    expect(validateQuantity('UNIT', 3)).toBeNull();
  });

  it('camino 4: rechaza decimales para productos por unidad', () => {
    expect(validateQuantity('UNIT', 1.5)).toBe('UNIT_REQUIRES_INTEGER');
  });

  it('camino 5: rechaza más de 3 decimales en kg', () => {
    expect(validateQuantity('KG', 0.7501)).toBe('TOO_MANY_DECIMALS');
  });

  it('camino 6: acepta 0,75 kg (TC-MED-001) y 1,5 lb', () => {
    expect(validateQuantity('KG', 0.75)).toBeNull();
    expect(validateQuantity('LB', 1.5)).toBeNull();
  });

  it('frontera: acepta la mínima cantidad positiva 0,001 kg', () => {
    expect(validateQuantity('KG', 0.001)).toBeNull();
  });
});

describe('lineSubtotal (SWR-SALE-003)', () => {
  it('multiplica cantidad por precio en unidades', () => {
    // Arrange
    const qty = toMilli(3);
    // Act
    const subtotal = lineSubtotal(qty, 2500);
    // Assert
    expect(subtotal).toBe(7500);
  });

  it('redondea al peso más cercano con cantidades decimales', () => {
    expect(lineSubtotal(toMilli(0.75), 12999)).toBe(9749); // 9749,25
    expect(lineSubtotal(toMilli(0.333), 1500)).toBe(500); // 499,5
  });

  it('evita errores de coma flotante', () => {
    expect(toMilli(0.1) + toMilli(0.2)).toBe(toMilli(0.3));
  });

  it('rechaza cantidad no positiva o precio negativo', () => {
    expect(() => lineSubtotal(0, 1000)).toThrow('Cantidad inválida');
    expect(() => lineSubtotal(1000, -1)).toThrow('Precio inválido');
  });
});

describe('saleTotal (SWR-SALE-004)', () => {
  it('suma los subtotales de todas las líneas', () => {
    expect(saleTotal([7500, 9749, 1])).toBe(17250);
  });

  it('venta sin líneas suma 0', () => {
    expect(saleTotal([])).toBe(0);
  });
});

describe('findShortages — caja blanca (SWR-SALE-007)', () => {
  const stock = new Map([
    ['p1', { name: 'Arroz', stockMilli: toMilli(2) }],
    ['p2', { name: 'Queso', stockMilli: toMilli(1.25) }],
  ]);

  it('camino sin faltantes: cantidad igual al stock (frontera) es válida', () => {
    expect(findShortages(new Map([['p1', toMilli(2)]]), stock)).toEqual([]);
  });

  it('camino con faltante: stock 2, pedir 3 (TC-SALE-002)', () => {
    const result = findShortages(new Map([['p1', toMilli(3)]]), stock);
    expect(result).toEqual([
      {
        productId: 'p1',
        name: 'Arroz',
        availableMilli: 2000,
        requestedMilli: 3000,
      },
    ]);
    expect(shortageMessage(result[0])).toBe(
      'Stock insuficiente para «Arroz»: disponible 2, solicitado 3',
    );
  });

  it('camino producto desconocido: se trata como stock 0', () => {
    const result = findShortages(new Map([['px', 1]]), stock);
    expect(result[0].availableMilli).toBe(0);
  });

  it('AJ-04: suma líneas repetidas antes de validar', () => {
    const requested = aggregateByProduct([
      { productId: 'p2', quantityMilli: toMilli(1) },
      { productId: 'p2', quantityMilli: toMilli(0.5) },
    ]);
    expect(requested.get('p2')).toBe(1500);
    expect(findShortages(requested, stock)).toHaveLength(1);
  });
});
