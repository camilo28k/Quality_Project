import { ConflictException } from '@nestjs/common';
import { UserStatusCache } from '../auth/user-status-cache';
import { AppLogger } from '../common/logger/app-logger.service';
import { PrismaService } from '../prisma/prisma.service';
import { CompanyService } from './company.service';

/** SWR-ONB-001: asistente de configuración inicial. */
describe('CompanyService', () => {
  let company: { findUnique: jest.Mock; update: jest.Mock };
  let cache: { invalidateCompany: jest.Mock };
  let service: CompanyService;
  const dto = {
    tradeName: 'Tienda Ana',
    taxId: '900123456-8',
    email: 'ventas@ana.test',
    invoicePrefix: 'TND-',
    firstInvoiceNumber: 120,
  };

  beforeEach(() => {
    company = {
      findUnique: jest.fn().mockResolvedValue({
        id: 'co1',
        onboardingCompleted: false,
        email: null,
        emailVerifiedAt: null,
      }),
      update: jest
        .fn()
        .mockImplementation(({ data }) =>
          Promise.resolve({ id: 'co1', ...data }),
        ),
    };
    cache = { invalidateCompany: jest.fn() };
    service = new CompanyService(
      { company } as unknown as PrismaService,
      { info: jest.fn() } as unknown as AppLogger,
      cache as unknown as UserStatusCache,
    );
  });

  it('completa el asistente: guarda los datos, fija el consecutivo y desbloquea a la empresa', async () => {
    await service.completeOnboarding('co1', dto, 'u-a');
    const data = company.update.mock.calls[0][0].data;
    expect(data).toMatchObject({
      tradeName: 'Tienda Ana',
      taxId: '900123456-8',
      nextInvoiceNumber: 120,
      onboardingCompleted: true,
      emailVerifiedAt: null,
    });
    expect(data).not.toHaveProperty('firstInvoiceNumber');
    expect(cache.invalidateCompany).toHaveBeenCalledWith('co1');
  });

  it('no se puede completar dos veces (evita reiniciar el consecutivo)', async () => {
    company.findUnique.mockResolvedValue({
      id: 'co1',
      onboardingCompleted: true,
    });
    await expect(
      service.completeOnboarding('co1', dto, 'u-a'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(company.update).not.toHaveBeenCalled();
  });

  it('editar el correo obliga a verificarlo de nuevo; otros campos no', async () => {
    company.findUnique.mockResolvedValue({
      id: 'co1',
      email: 'a@e.test',
      emailVerifiedAt: new Date(),
    });
    await service.update('co1', { email: 'b@e.test' }, 'u-a');
    expect(company.update.mock.calls[0][0].data).toEqual({
      email: 'b@e.test',
      emailVerifiedAt: null,
    });
    await service.update('co1', { city: 'Neiva' }, 'u-a');
    expect(company.update.mock.calls[1][0].data).toEqual({ city: 'Neiva' });
  });
});
