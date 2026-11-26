import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppLogger } from '../common/logger/app-logger.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './catalog.dto';
import { CatalogService, serializeProduct } from './catalog.service';

describe('CatalogService', () => {
  let prisma: {
    category: { findFirst: jest.Mock; create: jest.Mock; findMany: jest.Mock };
    product: {
      findUnique: jest.Mock;
      update: jest.Mock;
      findMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let tx: {
    product: { create: jest.Mock };
    inventoryMovement: { create: jest.Mock };
  };
  let service: CatalogService;
  let logger: { info: jest.Mock; warn: jest.Mock };

  const dto = (over: Partial<CreateProductDto> = {}): CreateProductDto => ({
    name: 'Arroz',
    categoryId: 'c1',
    unit: 'UNIT',
    cost: 1800,
    price: 2500,
    initialStock: 10,
    minStock: 2,
    ...over,
  });

  beforeEach(() => {
    tx = {
      product: {
        create: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ id: 'p1', active: true, ...data }),
          ),
      },
      inventoryMovement: { create: jest.fn().mockResolvedValue({}) },
    };
    prisma = {
      category: {
        findFirst: jest.fn(),
        create: jest.fn().mockResolvedValue({ id: 'c1', name: 'Granos' }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      product: {
        findUnique: jest.fn(),
        update: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            id: 'p1',
            stock: new Prisma.Decimal(3),
            minStock: new Prisma.Decimal(5),
            ...data,
          }),
        ),
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    logger = { info: jest.fn(), warn: jest.fn() };
    service = new CatalogService(
      prisma as unknown as PrismaService,
      logger as unknown as AppLogger,
    );
  });

  describe('createCategory (SWR-CAT-001, AJ-06)', () => {
    it('crea la categoría cuando el nombre no existe', async () => {
      prisma.category.findFirst.mockResolvedValue(null);
      await expect(
        service.createCategory({ name: 'Granos' }, 'co1'),
      ).resolves.toEqual({
        id: 'c1',
        name: 'Granos',
      });
      expect(prisma.category.findFirst).toHaveBeenCalledWith({
        where: {
          companyId: 'co1',
          name: { equals: 'Granos', mode: 'insensitive' },
        },
      });
    });

    it('rechaza un nombre repetido sin distinguir mayúsculas', async () => {
      prisma.category.findFirst.mockResolvedValue({ id: 'c0', name: 'Granos' });
      await expect(
        service.createCategory({ name: 'GRANOS' }, 'co1'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.category.create).not.toHaveBeenCalled();
    });
  });

  describe('createProduct (SWR-PROD-001, D-05)', () => {
    it('registra el producto y su stock inicial como movimiento INITIAL en la misma transacción', async () => {
      prisma.category.findFirst.mockResolvedValue({ id: 'c1' });

      const product = await service.createProduct(dto(), 'u1', 'co1');

      expect(product).toMatchObject({
        name: 'Arroz',
        stock: 10,
        minStock: 2,
        lowStock: false,
      });
      expect(tx.inventoryMovement.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          companyId: 'co1',
          productId: 'p1',
          type: 'INITIAL',
          userId: 'u1',
        }),
      });
    });

    it('acepta stock inicial 0 sin validar unidad (frontera)', async () => {
      prisma.category.findFirst.mockResolvedValue({ id: 'c1' });
      await expect(
        service.createProduct(dto({ initialStock: 0 }), 'u1', 'co1'),
      ).resolves.toMatchObject({
        stock: 0,
        lowStock: true,
      });
    });

    it('rechaza stock decimal en producto por unidad', async () => {
      await expect(
        service.createProduct(dto({ initialStock: 1.5 }), 'u1', 'co1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rechaza una categoría inexistente o inactiva', async () => {
      prisma.category.findFirst.mockResolvedValue(null);
      await expect(
        service.createProduct(dto(), 'u1', 'co1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('listProducts', () => {
    it('el vendedor solo consulta productos activos; el administrador puede incluir inactivos', async () => {
      await service.listProducts('co1', false);
      expect(prisma.product.findMany.mock.calls[0][0].where).toEqual({
        companyId: 'co1',
        active: true,
      });
      await service.listProducts('co1', true);
      expect(prisma.product.findMany.mock.calls[1][0].where).toEqual({
        companyId: 'co1',
      });
    });
  });

  describe('updateProduct y deactivateProduct (SWR-PROD-005)', () => {
    it('desactiva un producto existente sin borrarlo', async () => {
      prisma.product.findUnique.mockResolvedValue({
        id: 'p1',
        companyId: 'co1',
      });
      const result = await service.deactivateProduct('p1', 'co1');
      expect(prisma.product.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'p1' },
          data: { active: false },
        }),
      );
      expect(result.active).toBe(false);
    });

    it('cambia el precio y convierte el stock mínimo a decimal', async () => {
      prisma.product.findUnique.mockResolvedValue({
        id: 'p1',
        companyId: 'co1',
      });
      await service.updateProduct('p1', { price: 3000, minStock: 1.5 }, 'co1');
      const data = prisma.product.update.mock.calls[0][0].data;
      expect(data.price).toBe(3000);
      expect(Number(data.minStock)).toBe(1.5);
    });

    it('responde 404 si el producto no existe', async () => {
      prisma.product.findUnique.mockResolvedValue(null);
      await expect(
        service.deactivateProduct('px', 'co1'),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        service.updateProduct('px', { price: 1 }, 'co1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('aislamiento entre empresas (SWR-TEN-001/002)', () => {
    it('un producto de otra empresa responde 404, no se modifica y queda AUTHZ_DENIED CROSS_TENANT', async () => {
      prisma.product.findUnique.mockResolvedValue({
        id: 'p9',
        companyId: 'co2',
      });
      await expect(
        service.updateProduct('p9', { price: 1 }, 'co1', 'u1'),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        service.deactivateProduct('p9', 'co1', 'u1'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.product.update).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        'Tenancy',
        'AUTHZ_DENIED',
        expect.any(String),
        expect.objectContaining({ reason: 'CROSS_TENANT', entityId: 'p9' }),
      );
    });

    it('no acepta una categoría de otra empresa al crear un producto', async () => {
      prisma.category.findFirst.mockResolvedValue(null);
      await expect(
        service.createProduct(dto({ categoryId: 'c-otra' }), 'u1', 'co1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.category.findFirst).toHaveBeenCalledWith({
        where: { id: 'c-otra', companyId: 'co1', active: true },
      });
    });

    it('la unicidad del nombre de categoría se consulta solo dentro de la empresa', async () => {
      prisma.category.findFirst.mockResolvedValue(null);
      await service.createCategory({ name: 'Granos' }, 'co2');
      expect(prisma.category.create).toHaveBeenCalledWith({
        data: { name: 'Granos', companyId: 'co2' },
      });
    });
  });

  it('serializeProduct marca stock bajo cuando stock <= mínimo (frontera igual)', () => {
    const base = { id: 'p', minStock: new Prisma.Decimal(5) } as never;
    expect(
      serializeProduct({
        ...(base as object),
        stock: new Prisma.Decimal(5),
      } as never).lowStock,
    ).toBe(true);
    expect(
      serializeProduct({
        ...(base as object),
        stock: new Prisma.Decimal(6),
      } as never).lowStock,
    ).toBe(false);
  });
});
