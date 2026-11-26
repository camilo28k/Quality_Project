import { AuditService } from '../audit/audit.service';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { AppLogger } from '../common/logger/app-logger.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSaleDto } from './sales.dto';
import { pgErrorCode, SalesService } from './sales.service';

/**
 * Caja blanca de SalesService.confirm (versión de 2 idas y vueltas, FAL-01).
 * Caminos: A repetición | B stock insuficiente (lectura o carrera) | C clave duplicada concurrente | D venta confirmada.
 */
describe('SalesService.confirm — caja blanca', () => {
  const KEY = '7b1f8e0a-1111-4c3b-9b1a-0a0a0a0a0a0a';
  const ARROZ = {
    id: 'p1',
    name: 'Arroz',
    unit: 'UNIT',
    price: 2500,
    stock: 10,
    active: true,
  };

  let queryRaw: jest.Mock;
  let saleFindUnique: jest.Mock;
  let logger: { info: jest.Mock; warn: jest.Mock };
  let service: SalesService;

  const dto = (quantity: number): CreateSaleDto => ({
    idempotencyKey: KEY,
    paymentMethod: 'CASH',
    items: [{ productId: 'p1', quantity }],
  });
  const prepared = (products: object[], existing: string | null = null) => [
    { existing, products },
  ];
  const pgError = (code: string) =>
    Object.assign(
      new Error(`Raw query failed. Code: \`${code}\`. Message: test`),
      { meta: { code } },
    );
  /** Valores interpolados en la sentencia de escritura (segunda llamada a $queryRaw). */
  const writeValues = () => queryRaw.mock.calls[1].slice(1) as unknown[];

  beforeEach(() => {
    queryRaw = jest.fn();
    saleFindUnique = jest.fn();
    logger = { info: jest.fn(), warn: jest.fn() };
    const prisma = {
      $queryRaw: queryRaw,
      sale: { findUnique: saleFindUnique },
    } as unknown as PrismaService;
    service = new SalesService(
      prisma,
      logger as unknown as AppLogger,
      { record: jest.fn() } as unknown as AuditService,
    );
  });

  it('camino D: stock 10, vender 3 → una lectura y una escritura, total 7500 con precio aplicado (TC-SALE-001)', async () => {
    queryRaw.mockResolvedValueOnce(prepared([ARROZ])).mockResolvedValueOnce([
      {
        id: 's1',
        createdAt: new Date(),
        items: [{ id: 'i1', productId: 'p1' }],
      },
    ]);

    const result = await service.confirm(dto(3), 'u1', 'co1');

    expect(queryRaw).toHaveBeenCalledTimes(2);
    expect(result.replayed).toBe(false);
    expect(result.sale).toMatchObject({
      id: 's1',
      total: 7500,
      paymentMethod: 'CASH',
    });
    expect(result.sale.items[0]).toMatchObject({
      id: 'i1',
      unitPrice: 2500,
      subtotal: 7500,
      quantity: 3,
    });
    // La escritura recibe el descuento por producto y la clave de idempotencia.
    expect(writeValues()).toEqual(
      expect.arrayContaining([['p1'], ['3'], 7500, KEY, 'co1']),
    );
    // La lectura también se limita a la empresa (SWR-TEN-001).
    expect(queryRaw.mock.calls[0].slice(1)).toEqual(
      expect.arrayContaining(['co1', KEY]),
    );
    expect(logger.info).toHaveBeenCalledWith(
      'SalesService',
      'SALE_CONFIRMED',
      expect.any(String),
      expect.any(Object),
    );
  });

  it('camino B: stock insuficiente según la lectura → 409 sin escribir (TC-SALE-002)', async () => {
    queryRaw.mockResolvedValueOnce(prepared([{ ...ARROZ, stock: 2 }]));

    await expect(service.confirm(dto(3), 'u1', 'co1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      'SalesService',
      'SALE_REJECTED_STOCK',
      expect.any(String),
      expect.any(Object),
    );
  });

  it('camino B (carrera): la guardia aborta la escritura (22012) y se informa el stock actual', async () => {
    queryRaw
      .mockResolvedValueOnce(prepared([ARROZ]))
      .mockRejectedValueOnce(pgError('22012'))
      .mockResolvedValueOnce(prepared([{ ...ARROZ, stock: 1 }]));

    await expect(service.confirm(dto(3), 'u1', 'co1')).rejects.toThrow(
      new ConflictException([
        'Stock insuficiente para «Arroz»: disponible 1, solicitado 3',
      ]),
    );
  });

  it('camino B (carrera, stock repuesto): igual se rechaza sin confirmar', async () => {
    queryRaw
      .mockResolvedValueOnce(prepared([ARROZ]))
      .mockRejectedValueOnce(pgError('22012'))
      .mockResolvedValueOnce(prepared([ARROZ]));

    await expect(service.confirm(dto(3), 'u1', 'co1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('camino A: la clave ya existe → devuelve la venta sin escribir (TC-REL-001)', async () => {
    queryRaw.mockResolvedValueOnce(prepared([ARROZ], 's1'));
    saleFindUnique.mockResolvedValue({
      id: 's1',
      userId: 'u1',
      total: 7500,
      items: [{ quantity: '3' }],
    });

    const result = await service.confirm(dto(3), 'u1', 'co1');

    expect(result).toMatchObject({ replayed: true, sale: { id: 's1' } });
    expect(result.sale.items[0].quantity).toBe(3);
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it('camino A: la clave usada por otro usuario se rechaza', async () => {
    queryRaw.mockResolvedValueOnce(prepared([ARROZ], 's1'));
    saleFindUnique.mockResolvedValue({ id: 's1', userId: 'otro', items: [] });

    await expect(service.confirm(dto(3), 'u1', 'co1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('camino C: dos solicitudes simultáneas con la misma clave (23505) → la segunda recibe la primera venta', async () => {
    queryRaw
      .mockResolvedValueOnce(prepared([ARROZ]))
      .mockRejectedValueOnce(pgError('23505'));
    saleFindUnique.mockResolvedValue({
      id: 's1',
      userId: 'u1',
      total: 7500,
      items: [],
    });

    await expect(service.confirm(dto(3), 'u1', 'co1')).resolves.toMatchObject({
      replayed: true,
      sale: { id: 's1' },
    });
  });

  it('datos inválidos → 400 sin escribir; error desconocido de BD se propaga', async () => {
    queryRaw.mockResolvedValueOnce(prepared([ARROZ]));
    await expect(service.confirm(dto(1.5), 'u1', 'co1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(queryRaw).toHaveBeenCalledTimes(1);

    queryRaw
      .mockResolvedValueOnce(prepared([ARROZ]))
      .mockRejectedValueOnce(pgError('08006'));
    await expect(service.confirm(dto(1), 'u1', 'co1')).rejects.toThrow('08006');
  });
});

describe('pgErrorCode', () => {
  it('lee el código desde meta o desde el mensaje de Prisma', () => {
    expect(pgErrorCode({ meta: { code: '23505' } })).toBe('23505');
    expect(
      pgErrorCode(
        new Error('Raw query failed. Code: `22012`. Message: division by zero'),
      ),
    ).toBe('22012');
    expect(pgErrorCode(new Error('otro error'))).toBeNull();
  });
});

/** Lectura de ventas por empresa y por vendedor (SWR-TEN-001, SWR-ROLE-001). */
describe('SalesService — lectura por empresa y vendedor', () => {
  let findUnique: jest.Mock;
  let findMany: jest.Mock;
  let logger: { info: jest.Mock; warn: jest.Mock };
  let service: SalesService;
  const sale = { id: 's1', companyId: 'co1', userId: 'u-v1', items: [] };
  const admin = { userId: 'u-a', role: 'ADMIN' as const, companyId: 'co1' };
  const seller = { userId: 'u-v1', role: 'SELLER' as const, companyId: 'co1' };

  beforeEach(() => {
    findUnique = jest.fn();
    findMany = jest.fn().mockResolvedValue([]);
    logger = { info: jest.fn(), warn: jest.fn() };
    service = new SalesService(
      { sale: { findUnique, findMany } } as unknown as PrismaService,
      logger as unknown as AppLogger,
      { record: jest.fn() } as unknown as AuditService,
    );
  });

  it('el ADMIN lista todas las ventas de su empresa; el vendedor solo las suyas', async () => {
    await service.list(admin, 'co1');
    expect(findMany.mock.calls[0][0].where).toEqual({ companyId: 'co1' });
    await service.list(seller, 'co1');
    expect(findMany.mock.calls[1][0].where).toEqual({
      companyId: 'co1',
      userId: 'u-v1',
    });
  });

  it('una venta de otra empresa responde 404 y queda AUTHZ_DENIED CROSS_TENANT', async () => {
    findUnique.mockResolvedValue({ ...sale, companyId: 'co2' });
    await expect(service.findOne('s1', admin, 'co1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(logger.warn).toHaveBeenCalledWith(
      'Tenancy',
      'AUTHZ_DENIED',
      expect.any(String),
      expect.objectContaining({ reason: 'CROSS_TENANT' }),
    );
  });

  it('un vendedor no ve la venta de otro vendedor de su empresa (404, NOT_OWNER)', async () => {
    findUnique.mockResolvedValue({ ...sale, userId: 'u-v2' });
    await expect(service.findOne('s1', seller, 'co1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(JSON.stringify(logger.warn.mock.calls)).toContain('NOT_OWNER');
  });

  it('el vendedor ve su venta y el ADMIN ve cualquiera de su empresa', async () => {
    findUnique.mockResolvedValue(sale);
    await expect(service.findOne('s1', seller, 'co1')).resolves.toMatchObject({
      id: 's1',
    });
    await expect(service.findOne('s1', admin, 'co1')).resolves.toMatchObject({
      id: 's1',
    });
  });
});
