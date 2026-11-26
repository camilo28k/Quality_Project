import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AppLogger } from '../common/logger/app-logger.service';
import { PrismaService } from '../prisma/prisma.service';
import { CatalogService } from './catalog.service';
import { InventoryService } from './inventory.service';
import { ReviewService } from './review.service';

const ADMIN = { userId: 'u-a', role: 'ADMIN' as const, companyId: 'co1' };
const SELLER = { userId: 'u-v', role: 'SELLER' as const, companyId: 'co1' };
const product = (over: object = {}) => ({
  id: 'p1',
  companyId: 'co1',
  name: 'Arroz',
  description: null,
  categoryId: 'c1',
  unit: 'UNIT',
  cost: 1000,
  price: 2000,
  stock: new Prisma.Decimal(5),
  minStock: new Prisma.Decimal(1),
  active: true,
  approved: true,
  ...over,
});

/** Mock de prisma: cada modelo con los métodos usados; $transaction usa el mismo objeto. */
function makePrisma() {
  const m = () => jest.fn();
  const prisma = {
    product: {
      findUnique: m(),
      findUniqueOrThrow: m(),
      // Como Prisma, un campo undefined no cambia el valor.
      update: jest.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(
          product(
            Object.fromEntries(
              Object.entries(data).filter(([, v]) => v !== undefined),
            ),
          ),
        ),
      ),
      updateMany: m(),
      create: jest.fn(({ data }: { data: object }) =>
        Promise.resolve(product({ id: 'pn', ...data })),
      ),
      delete: m(),
      count: m(),
    },
    category: {
      findFirst: m(),
      findUnique: m(),
      update: m(),
      delete: m(),
      create: m(),
    },
    saleItem: { count: m() },
    inventoryMovement: { create: m(), deleteMany: m() },
    priceChangeRequest: {
      findUnique: m(),
      updateMany: m(),
      create: m(),
      count: m(),
      deleteMany: m(),
    },
    auditLog: { findMany: m() },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
    fn(prisma),
  );
  return prisma;
}

describe('Catálogo parte 3 (SWR-ROLE-003, SWR-CAT-D01, SWR-STK-001, SWR-AUD-001)', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let audit: { record: jest.Mock };
  let catalog: CatalogService;
  let inventory: InventoryService;
  let review: ReviewService;

  beforeEach(() => {
    prisma = makePrisma();
    audit = { record: jest.fn() };
    const logger = { info: jest.fn(), warn: jest.fn() } as unknown as AppLogger;
    const db = prisma as unknown as PrismaService;
    const aud = audit as unknown as AuditService;
    catalog = new CatalogService(db, logger, aud);
    inventory = new InventoryService(db, catalog, aud, logger);
    review = new ReviewService(db, catalog, aud, logger);
  });

  describe('productos', () => {
    const dto = {
      name: 'Café',
      categoryId: 'c1',
      unit: 'UNIT' as const,
      cost: 1,
      price: 9000,
      initialStock: 2,
      minStock: 0,
    };

    it('el producto que crea un vendedor queda pendiente de aprobación; el del ADMIN no', async () => {
      prisma.category.findFirst.mockResolvedValue({ id: 'c1' });
      await catalog.createProduct(dto, SELLER.userId, 'co1', SELLER);
      expect(prisma.product.create.mock.calls[0][0].data).toMatchObject({
        approved: false,
        createdById: 'u-v',
      });
      await catalog.createProduct(dto, ADMIN.userId, 'co1', ADMIN);
      expect(prisma.product.create.mock.calls[1][0].data).toMatchObject({
        approved: true,
      });
      expect(audit.record).toHaveBeenCalledWith(
        SELLER,
        expect.objectContaining({ action: 'PRODUCT_CREATED' }),
        prisma,
      );
    });

    it('el vendedor ve aprobados y sus propios pendientes', async () => {
      const findMany = jest.fn().mockResolvedValue([]);
      (prisma.product as Record<string, unknown>).findMany = findMany;
      await catalog.listProducts('co1', false, { userId: 'u-v' });
      expect(findMany.mock.calls[0][0].where).toEqual({
        companyId: 'co1',
        active: true,
        OR: [{ approved: true }, { createdById: 'u-v' }],
      });
    });

    it('el vendedor no puede cambiar precio, costo ni stock mínimo (403); sí nombre y descripción', async () => {
      prisma.product.findUnique.mockResolvedValue(product());
      await expect(
        catalog.updateProduct('p1', { price: 1 }, 'co1', SELLER),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.product.update).not.toHaveBeenCalled();
      // Así llega el DTO desde el ValidationPipe: los campos no enviados existen como undefined.
      await catalog.updateProduct(
        'p1',
        { name: 'Arroz Diana', price: undefined, cost: undefined },
        'co1',
        SELLER,
      );
      expect(prisma.product.update).toHaveBeenCalled();
    });

    it('un cambio de precio del ADMIN queda auditado como PRODUCT_PRICE_CHANGED con antes y después', async () => {
      prisma.product.findUnique.mockResolvedValue(product());
      await catalog.updateProduct('p1', { price: 2500 }, 'co1', ADMIN);
      expect(audit.record).toHaveBeenCalledWith(
        ADMIN,
        expect.objectContaining({
          action: 'PRODUCT_PRICE_CHANGED',
          before: { price: 2000 },
          after: { price: 2500 },
        }),
        prisma,
      );
    });

    it('no se elimina un producto con ventas (409, sugiere desactivar)', async () => {
      prisma.product.findUnique.mockResolvedValue(product());
      prisma.saleItem.count.mockResolvedValue(3);
      await expect(catalog.deleteProduct('p1', 'co1', ADMIN)).rejects.toThrow(
        /desactívelo/i,
      );
      expect(prisma.product.delete).not.toHaveBeenCalled();
    });

    it('elimina un producto sin ventas con sus movimientos y deja la foto en la auditoría', async () => {
      prisma.product.findUnique.mockResolvedValue(product());
      prisma.saleItem.count.mockResolvedValue(0);
      await expect(catalog.deleteProduct('p1', 'co1', ADMIN)).resolves.toEqual({
        deleted: true,
      });
      expect(prisma.inventoryMovement.deleteMany).toHaveBeenCalledWith({
        where: { productId: 'p1' },
      });
      expect(prisma.product.delete).toHaveBeenCalledWith({
        where: { id: 'p1' },
      });
      expect(audit.record).toHaveBeenCalledWith(
        ADMIN,
        expect.objectContaining({
          action: 'PRODUCT_DELETED',
          before: expect.objectContaining({ name: 'Arroz', price: 2000 }),
        }),
        prisma,
      );
    });
  });

  describe('categorías', () => {
    it('no se elimina una categoría con productos (409)', async () => {
      prisma.category.findUnique.mockResolvedValue({
        id: 'c1',
        companyId: 'co1',
        name: 'Granos',
        active: true,
      });
      prisma.product.count.mockResolvedValue(2);
      await expect(
        catalog.deleteCategory('c1', 'co1', ADMIN),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.category.delete).not.toHaveBeenCalled();
    });

    it('renombrar valida que el nombre nuevo no exista en la empresa', async () => {
      prisma.category.findUnique.mockResolvedValue({
        id: 'c1',
        companyId: 'co1',
        name: 'Granos',
        active: true,
      });
      prisma.category.findFirst.mockResolvedValue({
        id: 'c2',
        name: 'Bebidas',
      });
      await expect(
        catalog.updateCategory('c1', { name: 'bebidas' }, 'co1', ADMIN),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('stock', () => {
    it('la baja con stock insuficiente se rechaza (409) sin registrar movimiento', async () => {
      prisma.product.findUnique.mockResolvedValue(product());
      prisma.product.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        inventory.adjustOut(
          'p1',
          { quantity: 9, reason: 'Daño' },
          'co1',
          ADMIN,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.product.updateMany.mock.calls[0][0].where).toMatchObject({
        stock: { gte: new Prisma.Decimal(9) },
      });
      expect(prisma.inventoryMovement.create).not.toHaveBeenCalled();
    });

    it('la entrada suma, registra el movimiento con motivo y queda auditada', async () => {
      prisma.product.findUnique.mockResolvedValue(product());
      prisma.product.updateMany.mockResolvedValue({ count: 1 });
      prisma.product.findUniqueOrThrow.mockResolvedValue(
        product({ stock: new Prisma.Decimal(8) }),
      );
      const res = await inventory.entry(
        'p1',
        { quantity: 3, reason: 'Compra' },
        'co1',
        SELLER,
      );
      expect(res.stock).toBe(8);
      expect(
        prisma.inventoryMovement.create.mock.calls[0][0].data,
      ).toMatchObject({ type: 'ENTRY', reason: 'Compra', userId: 'u-v' });
      expect(audit.record).toHaveBeenCalledWith(
        SELLER,
        expect.objectContaining({
          action: 'STOCK_ENTRY',
          before: { stock: 5 },
          after: { stock: 8, quantity: 3 },
        }),
        prisma,
      );
    });

    it('rechaza cantidades decimales en productos por unidad', async () => {
      prisma.product.findUnique.mockResolvedValue(product());
      await expect(
        inventory.entry('p1', { quantity: 1.5, reason: 'x' }, 'co1', ADMIN),
      ).rejects.toThrow();
      expect(prisma.product.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('revisión de precios (decisión a)', () => {
    const req = {
      id: 'r1',
      companyId: 'co1',
      productId: 'p1',
      proposedPrice: 2500,
      status: 'PENDING',
    };

    it('aprobar aplica el precio y lo audita como PRODUCT_PRICE_CHANGED', async () => {
      prisma.priceChangeRequest.findUnique.mockResolvedValue(req);
      prisma.priceChangeRequest.updateMany.mockResolvedValue({ count: 1 });
      prisma.product.findUniqueOrThrow.mockResolvedValue(product());
      await review.resolvePriceRequest('r1', true, {}, 'co1', ADMIN);
      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { price: 2500, updatedById: 'u-a' },
      });
      expect(audit.record).toHaveBeenCalledWith(
        ADMIN,
        expect.objectContaining({ action: 'PRODUCT_PRICE_CHANGED' }),
        prisma,
      );
    });

    it('rechazar no cambia el precio', async () => {
      prisma.priceChangeRequest.findUnique.mockResolvedValue(req);
      prisma.priceChangeRequest.updateMany.mockResolvedValue({ count: 1 });
      await review.resolvePriceRequest(
        'r1',
        false,
        { reason: 'Muy bajo' },
        'co1',
        ADMIN,
      );
      expect(prisma.product.update).not.toHaveBeenCalled();
    });

    it('una solicitud ya resuelta (o resuelta en paralelo) responde 409', async () => {
      prisma.priceChangeRequest.findUnique.mockResolvedValue(req);
      prisma.priceChangeRequest.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        review.resolvePriceRequest('r1', true, {}, 'co1', ADMIN),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.product.update).not.toHaveBeenCalled();
    });

    it('no acepta una segunda solicitud pendiente ni un precio igual al actual', async () => {
      prisma.product.findUnique.mockResolvedValue(product());
      await expect(
        review.requestPriceChange('p1', { proposedPrice: 2000 }, 'co1', SELLER),
      ).rejects.toThrow();
      prisma.priceChangeRequest.count.mockResolvedValue(1);
      await expect(
        review.requestPriceChange('p1', { proposedPrice: 1500 }, 'co1', SELLER),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.priceChangeRequest.create).not.toHaveBeenCalled();
    });
  });

  describe('caminos adicionales (cobertura del Quality Gate)', () => {
    const cat = { id: 'c1', companyId: 'co1', name: 'Granos', active: true };

    it('renombrar con el mismo nombre (otra capitalización) no revisa duplicados y audita antes/después', async () => {
      prisma.category.findUnique.mockResolvedValue(cat);
      prisma.category.update.mockResolvedValue({ ...cat, name: 'GRANOS' });
      await catalog.updateCategory('c1', { name: 'GRANOS' }, 'co1', ADMIN);
      expect(prisma.category.findFirst).not.toHaveBeenCalled();
      expect(audit.record).toHaveBeenCalledWith(
        ADMIN,
        expect.objectContaining({
          action: 'CATEGORY_UPDATED',
          before: { name: 'Granos' },
          after: { name: 'GRANOS' },
        }),
        prisma,
      );
    });

    it('desactivar y reactivar una categoría queda auditado con la acción correcta', async () => {
      prisma.category.findUnique.mockResolvedValue(cat);
      prisma.category.update.mockResolvedValue(cat);
      await catalog.setCategoryActive('c1', false, 'co1', ADMIN);
      await catalog.setCategoryActive('c1', true, 'co1', ADMIN);
      const actions = audit.record.mock.calls.map(
        (c) => (c[1] as { action: string }).action,
      );
      expect(actions).toEqual(['CATEGORY_DEACTIVATED', 'CATEGORY_ACTIVATED']);
    });

    it('elimina una categoría vacía y lo audita', async () => {
      prisma.category.findUnique.mockResolvedValue(cat);
      prisma.product.count.mockResolvedValue(0);
      await expect(catalog.deleteCategory('c1', 'co1', ADMIN)).resolves.toEqual(
        { deleted: true },
      );
      expect(prisma.category.delete).toHaveBeenCalledWith({
        where: { id: 'c1' },
      });
    });

    it('una categoría de otra empresa responde 404', async () => {
      prisma.category.findUnique.mockResolvedValue({
        ...cat,
        companyId: 'co2',
      });
      await expect(
        catalog.setCategoryActive('c1', false, 'co1', ADMIN),
      ).rejects.toThrow('Categoría no encontrada');
      expect(prisma.category.update).not.toHaveBeenCalled();
    });

    it('el ADMIN incluye inactivas con su conteo de productos', async () => {
      const findMany = jest.fn().mockResolvedValue([]);
      (prisma.category as Record<string, unknown>).findMany = findMany;
      await catalog.listCategories('co1', true);
      expect(findMany.mock.calls[0][0]).toMatchObject({
        where: { companyId: 'co1' },
        include: { _count: { select: { products: true } } },
      });
    });

    it('cambiar la categoría de un producto exige que exista en la empresa', async () => {
      prisma.product.findUnique.mockResolvedValue(product());
      prisma.category.findFirst.mockResolvedValue(null);
      await expect(
        catalog.updateProduct('p1', { categoryId: 'c9' }, 'co1', ADMIN),
      ).rejects.toThrow();
      prisma.category.findFirst.mockResolvedValue({ id: 'c2' });
      await catalog.updateProduct('p1', { categoryId: 'c2' }, 'co1', ADMIN);
      expect(audit.record).toHaveBeenCalledWith(
        ADMIN,
        expect.objectContaining({ action: 'PRODUCT_UPDATED' }),
        prisma,
      );
    });

    it('una edición sin cambios reales no escribe en la auditoría', async () => {
      prisma.product.findUnique.mockResolvedValue(product());
      await catalog.updateProduct('p1', { name: 'Arroz' }, 'co1', ADMIN);
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('reactivar un producto queda auditado', async () => {
      prisma.product.findUnique.mockResolvedValue(product({ active: false }));
      await catalog.setProductActive('p1', true, 'co1', ADMIN);
      expect(audit.record).toHaveBeenCalledWith(
        ADMIN,
        expect.objectContaining({
          action: 'PRODUCT_ACTIVATED',
          before: { active: false },
          after: { active: true },
        }),
        prisma,
      );
    });

    it('la baja con stock suficiente se registra como ADJUSTMENT_OUT con motivo', async () => {
      prisma.product.findUnique.mockResolvedValue(product());
      prisma.product.updateMany.mockResolvedValue({ count: 1 });
      prisma.product.findUniqueOrThrow.mockResolvedValue(
        product({ stock: new Prisma.Decimal(3) }),
      );
      await inventory.adjustOut(
        'p1',
        { quantity: 2, reason: 'Daño' },
        'co1',
        ADMIN,
      );
      expect(
        prisma.inventoryMovement.create.mock.calls[0][0].data,
      ).toMatchObject({ type: 'ADJUSTMENT_OUT', reason: 'Daño' });
    });

    it('historial de movimientos con cantidades como número', async () => {
      prisma.product.findUnique.mockResolvedValue(product());
      (prisma.inventoryMovement as Record<string, unknown>).findMany = jest
        .fn()
        .mockResolvedValue([
          { id: 'm1', type: 'ENTRY', quantity: new Prisma.Decimal('1.500') },
        ]);
      await expect(inventory.movements('p1', 'co1', ADMIN)).resolves.toEqual([
        expect.objectContaining({ id: 'm1', quantity: 1.5 }),
      ]);
    });

    it('solicitud de precio válida queda pendiente y auditada', async () => {
      prisma.product.findUnique.mockResolvedValue(product());
      prisma.priceChangeRequest.count.mockResolvedValue(0);
      prisma.priceChangeRequest.create.mockResolvedValue({ id: 'r1' });
      await review.requestPriceChange(
        'p1',
        { proposedPrice: 2300, reason: 'Proveedor' },
        'co1',
        SELLER,
      );
      expect(
        prisma.priceChangeRequest.create.mock.calls[0][0].data,
      ).toMatchObject({
        currentPrice: 2000,
        proposedPrice: 2300,
        requestedById: 'u-v',
      });
      expect(audit.record).toHaveBeenCalledWith(
        SELLER,
        expect.objectContaining({ action: 'PRICE_CHANGE_REQUESTED' }),
        prisma,
      );
    });

    it('aprobar un producto pendiente usa el precio del ADMIN o, si no envía, el sugerido', async () => {
      prisma.product.findUnique.mockResolvedValue(product({ approved: false }));
      await review.approveProduct('p1', { price: 1800 }, 'co1', ADMIN);
      expect(prisma.product.update.mock.calls[0][0].data).toMatchObject({
        approved: true,
        price: 1800,
      });
      await review.approveProduct('p1', {}, 'co1', ADMIN);
      expect(prisma.product.update.mock.calls[1][0].data).toMatchObject({
        approved: true,
        price: 2000,
      });
    });

    it('no se aprueba dos veces un producto', async () => {
      prisma.product.findUnique.mockResolvedValue(product());
      await expect(
        review.approveProduct('p1', {}, 'co1', ADMIN),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('una solicitud de otra empresa responde 404', async () => {
      prisma.priceChangeRequest.findUnique.mockResolvedValue({
        id: 'r1',
        companyId: 'co2',
        status: 'PENDING',
      });
      await expect(
        review.resolvePriceRequest('r1', true, {}, 'co1', ADMIN),
      ).rejects.toThrow('Solicitud no encontrada');
    });

    it('el resumen de revisión arma nombres de usuarios y productos', async () => {
      (prisma.product as Record<string, unknown>).findMany = jest
        .fn()
        .mockResolvedValueOnce([
          product({ approved: false, createdById: 'u-v' }),
        ])
        .mockResolvedValueOnce([{ id: 'p1', name: 'Arroz' }]);
      (prisma.priceChangeRequest as Record<string, unknown>).findMany = jest
        .fn()
        .mockResolvedValue([{ id: 'r1', requestedById: 'u-v' }]);
      prisma.auditLog.findMany.mockResolvedValue([
        {
          id: 'a1',
          entityId: 'p1',
          userId: 'u-a',
          role: 'ADMIN',
          before: { price: 1 },
          after: { price: 2 },
          createdAt: new Date(),
        },
      ]);
      (prisma as Record<string, unknown>).user = {
        findMany: jest.fn().mockResolvedValue([
          { id: 'u-v', name: 'Carlos' },
          { id: 'u-a', name: 'Rosa' },
        ]),
      };
      const res = await review.summary('co1');
      expect(res.pendingProducts[0].createdByName).toBe('Carlos');
      expect(res.priceRequests[0].requestedByName).toBe('Carlos');
      expect(res.recentPriceChanges[0]).toMatchObject({
        productName: 'Arroz',
        userName: 'Rosa',
      });
    });

    it('el vendedor lista sus propias solicitudes', async () => {
      const findMany = jest.fn().mockResolvedValue([]);
      (prisma.priceChangeRequest as Record<string, unknown>).findMany =
        findMany;
      await review.listMyRequests('co1', 'u-v');
      expect(findMany.mock.calls[0][0].where).toEqual({
        companyId: 'co1',
        requestedById: 'u-v',
      });
    });
  });
});
