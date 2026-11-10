import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppLogger } from '../common/logger/app-logger.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSaleDto } from './sales.dto';
import { SalesService } from './sales.service';

/**
 * Caja blanca de SalesService.confirm.
 * Caminos: A repetición | B stock insuficiente | C carrera de clave duplicada | D venta confirmada.
 */
describe('SalesService.confirm — caja blanca', () => {
  const KEY = '7b1f8e0a-1111-4c3b-9b1a-0a0a0a0a0a0a';
  const PRODUCT = {
    id: 'p1',
    name: 'Arroz',
    unit: 'UNIT',
    price: 2500,
    stock: new Prisma.Decimal(10),
    active: true,
  };

  let tx: {
    product: {
      findMany: jest.Mock;
      updateMany: jest.Mock;
      findUnique: jest.Mock;
    };
    sale: { create: jest.Mock };
    inventoryMovement: { createMany: jest.Mock };
  };
  let saleFindUnique: jest.Mock;
  let transaction: jest.Mock;
  let logger: { info: jest.Mock; warn: jest.Mock };
  let service: SalesService;

  const dto = (quantity: number): CreateSaleDto => ({
    idempotencyKey: KEY,
    paymentMethod: 'CASH',
    items: [{ productId: 'p1', quantity }],
  });

  beforeEach(() => {
    tx = {
      product: {
        findMany: jest.fn().mockResolvedValue([PRODUCT]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue(PRODUCT),
      },
      sale: {
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            id: 's1',
            userId: 'u1',
            paymentMethod: data.paymentMethod,
            total: data.total,
            idempotencyKey: data.idempotencyKey,
            createdAt: new Date(),
            items: data.items.create.map((i: object) => ({
              id: 'i1',
              saleId: 's1',
              ...i,
            })),
          }),
        ),
      },
      inventoryMovement: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    saleFindUnique = jest.fn().mockResolvedValue(null);
    transaction = jest.fn((fn: (t: typeof tx) => unknown) => fn(tx));
    logger = { info: jest.fn(), warn: jest.fn() };
    const prisma = {
      sale: { findUnique: saleFindUnique },
      $transaction: transaction,
    } as unknown as PrismaService;
    service = new SalesService(prisma, logger as unknown as AppLogger);
  });

  it('camino D: stock 10, vender 3 → descuenta 3, total 7500 y precio aplicado (TC-SALE-001)', async () => {
    const result = await service.confirm(dto(3), 'u1');

    expect(result.replayed).toBe(false);
    expect(result.sale.total).toBe(7500);
    expect(result.sale.items[0]).toMatchObject({
      unitPrice: 2500,
      subtotal: 7500,
      quantity: 3,
    });
    const update = tx.product.updateMany.mock.calls[0][0];
    expect(Number(update.data.stock.decrement)).toBe(3);
    expect(Number(update.where.stock.gte)).toBe(3);
    expect(tx.inventoryMovement.createMany).toHaveBeenCalledTimes(1);
  });

  it('camino B: stock insuficiente → 409, sin descuento ni venta (TC-SALE-002)', async () => {
    tx.product.findMany.mockResolvedValue([
      { ...PRODUCT, stock: new Prisma.Decimal(2) },
    ]);

    await expect(service.confirm(dto(3), 'u1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(tx.product.updateMany).not.toHaveBeenCalled();
    expect(tx.sale.create).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      'SalesService',
      'SALE_REJECTED_STOCK',
      expect.any(String),
      expect.any(Object),
    );
  });

  it('camino B (carrera): otra venta consumió el stock entre lectura y descuento', async () => {
    tx.product.updateMany.mockResolvedValue({ count: 0 });
    tx.product.findUnique.mockResolvedValue({
      ...PRODUCT,
      stock: new Prisma.Decimal(1),
    });

    await expect(service.confirm(dto(3), 'u1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(tx.sale.create).not.toHaveBeenCalled();
  });

  it('camino A: repetir la misma solicitud devuelve la venta existente sin transacción (TC-REL-001)', async () => {
    saleFindUnique.mockResolvedValue({
      id: 's1',
      userId: 'u1',
      total: 7500,
      items: [{ quantity: new Prisma.Decimal(3) }],
    });

    const result = await service.confirm(dto(3), 'u1');

    expect(result.replayed).toBe(true);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('camino A: la clave usada por otro usuario se rechaza', async () => {
    saleFindUnique.mockResolvedValue({ id: 's1', userId: 'otro', items: [] });
    await expect(service.confirm(dto(3), 'u1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('camino C: dos solicitudes simultáneas con la misma clave → la segunda recibe la primera venta', async () => {
    const existing = { id: 's1', userId: 'u1', total: 7500, items: [] };
    saleFindUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(existing);
    transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    const result = await service.confirm(dto(3), 'u1');
    expect(result).toMatchObject({ replayed: true, sale: { id: 's1' } });
  });

  it('rechaza producto inactivo y cantidad decimal para producto por unidad', async () => {
    tx.product.findMany.mockResolvedValue([PRODUCT]);
    await expect(service.confirm(dto(1.5), 'u1')).rejects.toThrow();
    tx.product.findMany.mockResolvedValue([{ ...PRODUCT, active: false }]);
    await expect(service.confirm(dto(1), 'u1')).rejects.toThrow();
    expect(tx.product.updateMany).not.toHaveBeenCalled();
  });
});
