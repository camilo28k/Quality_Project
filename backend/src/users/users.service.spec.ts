import { AuditService } from '../audit/audit.service';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { UserStatusCache } from '../auth/user-status-cache';
import { AppLogger } from '../common/logger/app-logger.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

/** SWR-ROLE-002: el ADMIN gestiona solo vendedores de su empresa. */
describe('UsersService', () => {
  let user: {
    findUnique: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    findMany: jest.Mock;
  };
  let cache: { invalidate: jest.Mock };
  let logger: { info: jest.Mock; warn: jest.Mock };
  let service: UsersService;
  let audit: { record: jest.Mock };
  const ADMIN = { userId: 'u-a', role: 'ADMIN' as const, companyId: 'co1' };

  beforeEach(() => {
    user = {
      findUnique: jest.fn(),
      create: jest
        .fn()
        .mockImplementation(({ data }) =>
          Promise.resolve({ id: 'v1', ...data }),
        ),
      update: jest
        .fn()
        .mockImplementation(({ data }) =>
          Promise.resolve({ id: 'v1', ...data }),
        ),
      findMany: jest.fn().mockResolvedValue([]),
    };
    cache = { invalidate: jest.fn() };
    audit = { record: jest.fn() };
    logger = { info: jest.fn(), warn: jest.fn() };
    const prisma = { user } as Record<string, unknown>;
    prisma.$transaction = jest.fn((fn: (tx: unknown) => unknown) => fn(prisma));
    service = new UsersService(
      prisma as unknown as PrismaService,
      logger as unknown as AppLogger,
      cache as unknown as UserStatusCache,
      audit as unknown as AuditService,
    );
  });

  it('crea el vendedor en la empresa del ADMIN, con rol SELLER y cambio de contraseña obligatorio', async () => {
    await service.createSeller(
      { name: 'Ana', email: 'ana@t.test', temporaryPassword: 'Temporal-12345' },
      'co1',
      ADMIN,
    );
    const data = user.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      companyId: 'co1',
      role: 'SELLER',
      mustChangePassword: true,
    });
    expect(data.passwordHash).not.toBe('Temporal-12345');
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain(
      'Temporal-12345',
    );
  });

  it('un correo repetido responde 409 con mensaje claro', async () => {
    user.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: 'x',
      }),
    );
    await expect(
      service.createSeller(
        { name: 'Ana', email: 'a@t.test', temporaryPassword: 'Temporal-12345' },
        'co1',
        ADMIN,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('lista solo las cuentas de su empresa', async () => {
    await service.list('co1');
    expect(user.findMany.mock.calls[0][0].where).toEqual({ companyId: 'co1' });
  });

  it('desactivar invalida la sesión del vendedor de inmediato', async () => {
    user.findUnique.mockResolvedValue({
      id: 'v1',
      role: 'SELLER',
      companyId: 'co1',
    });
    await service.setSellerActive('v1', false, 'co1', ADMIN);
    expect(user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { active: false } }),
    );
    expect(cache.invalidate).toHaveBeenCalledWith('v1');
  });

  it('un vendedor de otra empresa responde 404 y queda CROSS_TENANT', async () => {
    user.findUnique.mockResolvedValue({
      id: 'v9',
      role: 'SELLER',
      companyId: 'co2',
    });
    await expect(
      service.setSellerActive('v9', false, 'co1', ADMIN),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(user.update).not.toHaveBeenCalled();
    expect(JSON.stringify(logger.warn.mock.calls)).toContain('CROSS_TENANT');
  });

  it('el ADMIN no puede editar ni desactivar a otro ADMIN ni al SUPER_ADMIN', async () => {
    user.findUnique.mockResolvedValueOnce({
      id: 'a2',
      role: 'ADMIN',
      companyId: 'co1',
    });
    await expect(
      service.updateSeller('a2', { name: 'x' }, 'co1', ADMIN),
    ).rejects.toBeInstanceOf(NotFoundException);
    user.findUnique.mockResolvedValueOnce({
      id: 'sa',
      role: 'SUPER_ADMIN',
      companyId: null,
    });
    await expect(
      service.setSellerActive('sa', false, 'co1', ADMIN),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(user.update).not.toHaveBeenCalled();
  });
});
