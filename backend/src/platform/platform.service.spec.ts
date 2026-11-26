import { NotFoundException } from '@nestjs/common';
import { UserStatusCache } from '../auth/user-status-cache';
import { AppLogger } from '../common/logger/app-logger.service';
import { PrismaService } from '../prisma/prisma.service';
import { PlatformService } from './platform.service';

/** Gestión de empresas por el SUPER_ADMIN (SWR-TEN-003, SWR-ROLE-001, SWR-MAIL-001). */
describe('PlatformService', () => {
  let company: {
    findUnique: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    findMany: jest.Mock;
  };
  let user: { create: jest.Mock };
  let cache: { invalidateCompany: jest.Mock };
  let service: PlatformService;

  beforeEach(() => {
    company = {
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: 'co1', email: 'old@e.test', users: [] }),
      create: jest.fn().mockResolvedValue({ id: 'co1' }),
      update: jest.fn().mockResolvedValue({ id: 'co1' }),
      findMany: jest.fn().mockResolvedValue([]),
    };
    user = {
      create: jest
        .fn()
        .mockImplementation(({ data }) =>
          Promise.resolve({ id: 'a1', ...data }),
        ),
    };
    cache = { invalidateCompany: jest.fn() };
    service = new PlatformService(
      { company, user } as unknown as PrismaService,
      { info: jest.fn(), warn: jest.fn() } as unknown as AppLogger,
      cache as unknown as UserStatusCache,
    );
  });

  it('la empresa nueva se crea solo con el nombre y queda con el asistente pendiente (default de la BD)', async () => {
    await service.createCompany({ tradeName: 'Tienda Ana' }, 'sa');
    expect(company.create.mock.calls[0][0].data).toEqual({
      tradeName: 'Tienda Ana',
    });
  });

  it('desactivar una empresa invalida al momento las sesiones de sus usuarios', async () => {
    await service.setCompanyActive('co1', false, 'sa');
    expect(company.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { active: false } }),
    );
    expect(cache.invalidateCompany).toHaveBeenCalledWith('co1');
  });

  it('cambiar el correo de la empresa obliga a verificarlo de nuevo', async () => {
    await service.updateCompany('co1', { email: 'nuevo@e.test' }, 'sa');
    expect(company.update.mock.calls[0][0].data).toEqual({
      email: 'nuevo@e.test',
      emailVerifiedAt: null,
    });
    await service.updateCompany('co1', { email: 'old@e.test' }, 'sa');
    expect(company.update.mock.calls[1][0].data).toEqual({
      email: 'old@e.test',
    });
  });

  it('el ADMIN creado pertenece a la empresa y debe cambiar la contraseña temporal', async () => {
    await service.createCompanyAdmin(
      'co1',
      { name: 'Ana', email: 'ana@e.test', temporaryPassword: 'Temporal-12345' },
      'sa',
    );
    expect(user.create.mock.calls[0][0].data).toMatchObject({
      companyId: 'co1',
      role: 'ADMIN',
      mustChangePassword: true,
    });
  });

  it('una empresa inexistente responde 404', async () => {
    company.findUnique.mockResolvedValue(null);
    await expect(
      service.setCompanyActive('x', false, 'sa'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(company.update).not.toHaveBeenCalled();
  });
});
