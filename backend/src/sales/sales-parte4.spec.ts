import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { InvoiceMailerService } from './invoice-mailer.service';

/** El correo se prueba aparte; aquí no envía nada. */
const mailerMock = () => ({
  queue: jest.fn(),
  lastDeliveredTo: jest.fn().mockResolvedValue(null),
  send: jest.fn(),
  history: jest.fn(),
});
import { AppLogger } from '../common/logger/app-logger.service';
import { PrismaService } from '../prisma/prisma.service';
import { CorrectionsService } from './corrections.service';
import { SalesService } from './sales.service';

const ADMIN = { userId: 'u-a', role: 'ADMIN' as const, companyId: 'co1' };
const SELLER = { userId: 'u-v', role: 'SELLER' as const, companyId: 'co1' };
const KEY = '7b1f8e0a-1111-4c3b-9b1a-0a0a0a0a0a0b';

const sale = (over: object = {}) => ({
  id: 's1',
  companyId: 'co1',
  userId: 'u-v',
  invoiceNumber: 'FAC-7',
  total: 7500,
  status: 'CONFIRMED',
  items: [
    { id: 'i1', productId: 'p1', quantity: new Prisma.Decimal(2) },
    { id: 'i2', productId: 'p1', quantity: new Prisma.Decimal(1) },
    { id: 'i3', productId: 'p2', quantity: new Prisma.Decimal('0.5') },
  ],
  ...over,
});

function makePrisma() {
  const m = () => jest.fn();
  const prisma = {
    sale: { findUnique: m(), updateMany: m() },
    product: { update: m() },
    inventoryMovement: { createMany: m() },
    saleCorrectionRequest: {
      updateMany: m(),
      count: m(),
      create: m(),
      findUnique: m(),
      findMany: m(),
    },
    company: { findUniqueOrThrow: m() },
    user: { findMany: jest.fn().mockResolvedValue([]) },
    $queryRaw: m(),
    $transaction: m(),
  };
  prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
    fn(prisma),
  );
  return prisma;
}

describe('Parte 4: anulación, reemisión y factura (SWR-SALE-V01/V02, SWR-INV-001)', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let audit: { record: jest.Mock };
  let service: SalesService;

  beforeEach(() => {
    prisma = makePrisma();
    audit = { record: jest.fn() };
    service = new SalesService(
      prisma as unknown as PrismaService,
      { info: jest.fn(), warn: jest.fn() } as unknown as AppLogger,
      audit as unknown as AuditService,
      mailerMock() as unknown as InvoiceMailerService,
    );
  });

  describe('anular', () => {
    beforeEach(() => {
      prisma.sale.findUnique.mockResolvedValue(sale());
      prisma.sale.updateMany.mockResolvedValue({ count: 1 });
    });

    it('marca ANULADA solo si sigue confirmada, con motivo y quién', async () => {
      // findOne final (tras anular) devuelve la venta anulada
      prisma.sale.findUnique
        .mockResolvedValueOnce(sale())
        .mockResolvedValueOnce(sale({ status: 'VOIDED' }));
      await service.void('s1', 'Cobro duplicado', 'co1', ADMIN);
      expect(prisma.sale.updateMany).toHaveBeenCalledWith({
        where: { id: 's1', companyId: 'co1', status: 'CONFIRMED' },
        data: expect.objectContaining({
          status: 'VOIDED',
          voidedById: 'u-a',
          voidReason: 'Cobro duplicado',
        }),
      });
    });

    it('devuelve el stock sumado por producto y registra VOID_RETURN con el motivo', async () => {
      await service
        .void('s1', 'Error de cantidad', 'co1', ADMIN)
        .catch(() => undefined);
      const updates = prisma.product.update.mock.calls.map((c) => [
        c[0].where.id,
        String(c[0].data.stock.increment),
      ]);
      expect(updates).toEqual([
        ['p1', '3'],
        ['p2', '0.5'],
      ]);
      const movs = prisma.inventoryMovement.createMany.mock.calls[0][0].data;
      expect(movs).toEqual([
        expect.objectContaining({
          productId: 'p1',
          type: 'VOID_RETURN',
          saleId: 's1',
          reason: 'Error de cantidad',
        }),
        expect.objectContaining({ productId: 'p2', type: 'VOID_RETURN' }),
      ]);
    });

    it('resuelve la solicitud de corrección pendiente y audita SALE_VOIDED', async () => {
      await service
        .void('s1', 'Pedido del cliente', 'co1', ADMIN)
        .catch(() => undefined);
      expect(prisma.saleCorrectionRequest.updateMany).toHaveBeenCalledWith({
        where: { saleId: 's1', status: 'PENDING' },
        data: expect.objectContaining({ status: 'APPROVED' }),
      });
      expect(audit.record).toHaveBeenCalledWith(
        ADMIN,
        expect.objectContaining({
          action: 'SALE_VOIDED',
          before: expect.objectContaining({ invoiceNumber: 'FAC-7' }),
        }),
        prisma,
      );
    });

    it('anular dos veces (o en paralelo) responde 409 sin devolver stock', async () => {
      prisma.sale.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        service.void('s1', 'x', 'co1', ADMIN),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.product.update).not.toHaveBeenCalled();
    });

    it('una venta ya anulada responde 409 antes de abrir la transacción', async () => {
      prisma.sale.findUnique.mockResolvedValue(sale({ status: 'VOIDED' }));
      await expect(
        service.void('s1', 'x', 'co1', ADMIN),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('una venta de otra empresa responde 404', async () => {
      prisma.sale.findUnique.mockResolvedValue(sale({ companyId: 'co2' }));
      await expect(
        service.void('s1', 'x', 'co1', ADMIN),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('reemitir', () => {
    const dto = {
      idempotencyKey: KEY,
      paymentMethod: 'CASH' as const,
      items: [{ productId: 'p1', quantity: 2 }],
      reason: 'Eran 2, no 3',
    };
    const products = [
      {
        id: 'p1',
        name: 'Arroz',
        unit: 'UNIT',
        price: 2500,
        stock: 10,
        active: true,
      },
    ];

    beforeEach(() => {
      prisma.sale.findUnique.mockResolvedValue(sale());
      prisma.sale.updateMany.mockResolvedValue({ count: 1 });
    });

    it('anula la original y crea la nueva a nombre del mismo vendedor, vinculada y con consecutivo nuevo', async () => {
      prisma.$queryRaw
        .mockResolvedValueOnce([{ existing: null, products }])
        .mockResolvedValueOnce([
          {
            id: 's2',
            createdAt: new Date(),
            invoiceNumber: 'FAC-8',
            items: [{ id: 'i9', productId: 'p1' }],
          },
        ]);
      const res = await service.reissue('s1', dto, 'co1', ADMIN);
      expect(res.sale).toMatchObject({
        id: 's2',
        invoiceNumber: 'FAC-8',
        userId: 'u-v',
        correctsSaleId: 's1',
        total: 5000,
      });
      const writeValues = prisma.$queryRaw.mock.calls[1].slice(1) as unknown[];
      expect(writeValues).toEqual(expect.arrayContaining(['u-v', 's1', 'co1']));
      expect(audit.record).toHaveBeenCalledWith(
        ADMIN,
        expect.objectContaining({
          action: 'SALE_REISSUED',
          before: { invoiceNumber: 'FAC-7', total: 7500 },
          after: { invoiceNumber: 'FAC-8', total: 5000 },
        }),
        prisma,
      );
    });

    it('si la venta nueva no alcanza stock, falla toda la transacción (la original no queda anulada)', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([
        { existing: null, products: [{ ...products[0], stock: 1 }] },
      ]);
      await expect(
        service.reissue('s1', dto, 'co1', ADMIN),
      ).rejects.toBeInstanceOf(ConflictException);
      // La anulación se intentó dentro de la misma transacción que falló: PostgreSQL la deshace.
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('si otra venta gana el stock en la escritura (22012) responde 409 claro', async () => {
      prisma.$queryRaw
        .mockResolvedValueOnce([{ existing: null, products }])
        .mockRejectedValueOnce(
          Object.assign(new Error('x'), { meta: { code: '22012' } }),
        );
      await expect(service.reissue('s1', dto, 'co1', ADMIN)).rejects.toThrow(
        /consumió el stock/,
      );
    });

    it('una clave de idempotencia ya usada responde 409', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([{ existing: 'sX', products }]);
      await expect(service.reissue('s1', dto, 'co1', ADMIN)).rejects.toThrow(
        /idempotencia/,
      );
    });
  });

  it('la factura trae los datos de la empresa y la venta con su vendedor', async () => {
    prisma.sale.findUnique.mockResolvedValue({
      ...sale(),
      user: { id: 'u-v', name: 'Carlos' },
      items: [],
    });
    prisma.company.findUniqueOrThrow.mockResolvedValue({
      tradeName: 'Doña Rosa',
      taxId: '900123456-8',
    });
    const inv = await service.invoice('s1', ADMIN, 'co1');
    expect(inv.company).toMatchObject({ tradeName: 'Doña Rosa' });
    expect(inv.sale).toMatchObject({
      invoiceNumber: 'FAC-7',
      user: { name: 'Carlos' },
    });
  });
});

describe('Solicitudes de corrección (SWR-SALE-V03)', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let audit: { record: jest.Mock };
  let service: CorrectionsService;

  beforeEach(() => {
    prisma = makePrisma();
    audit = { record: jest.fn() };
    service = new CorrectionsService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
      { info: jest.fn(), warn: jest.fn() } as unknown as AppLogger,
    );
  });

  it('el vendedor pide corregir su venta confirmada y queda auditado', async () => {
    prisma.sale.findUnique.mockResolvedValue(sale());
    prisma.saleCorrectionRequest.count.mockResolvedValue(0);
    prisma.saleCorrectionRequest.create.mockResolvedValue({ id: 'c1' });
    await service.request('s1', 'Cobré de más', 'co1', SELLER);
    expect(prisma.saleCorrectionRequest.create.mock.calls[0][0].data).toEqual({
      companyId: 'co1',
      saleId: 's1',
      requestedById: 'u-v',
      reason: 'Cobré de más',
    });
    expect(audit.record).toHaveBeenCalledWith(
      SELLER,
      expect.objectContaining({ action: 'SALE_CORRECTION_REQUESTED' }),
      prisma,
    );
  });

  it('no puede pedir sobre la venta de otro vendedor (404), una anulada (409) ni repetir (409)', async () => {
    prisma.sale.findUnique.mockResolvedValueOnce(sale({ userId: 'otro' }));
    await expect(
      service.request('s1', 'x', 'co1', SELLER),
    ).rejects.toBeInstanceOf(NotFoundException);
    prisma.sale.findUnique.mockResolvedValueOnce(sale({ status: 'VOIDED' }));
    await expect(
      service.request('s1', 'x', 'co1', SELLER),
    ).rejects.toBeInstanceOf(ConflictException);
    prisma.sale.findUnique.mockResolvedValueOnce(sale());
    prisma.saleCorrectionRequest.count.mockResolvedValueOnce(1);
    await expect(
      service.request('s1', 'x', 'co1', SELLER),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.saleCorrectionRequest.create).not.toHaveBeenCalled();
  });

  it('el ADMIN ve las pendientes de la empresa; el vendedor solo las suyas', async () => {
    prisma.saleCorrectionRequest.findMany.mockResolvedValue([]);
    await service.list('co1', ADMIN);
    expect(
      prisma.saleCorrectionRequest.findMany.mock.calls[0][0].where,
    ).toEqual({ companyId: 'co1', status: 'PENDING' });
    await service.list('co1', SELLER, 'ALL');
    expect(
      prisma.saleCorrectionRequest.findMany.mock.calls[1][0].where,
    ).toEqual({ companyId: 'co1', requestedById: 'u-v' });
  });

  it('rechazar resuelve una sola vez', async () => {
    prisma.saleCorrectionRequest.findUnique.mockResolvedValue({
      id: 'c1',
      companyId: 'co1',
      saleId: 's1',
    });
    prisma.saleCorrectionRequest.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    await expect(
      service.reject('c1', 'Está bien cobrada', 'co1', ADMIN),
    ).resolves.toEqual({ id: 'c1', status: 'REJECTED' });
    await expect(
      service.reject('c1', undefined, 'co1', ADMIN),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
