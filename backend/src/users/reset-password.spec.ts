import { NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { verifyPassword } from '../auth/password.util';
import { UserStatusCache } from '../auth/user-status-cache';
import { AppLogger } from '../common/logger/app-logger.service';
import { PlatformService } from '../platform/platform.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

const ADMIN = { userId: 'u-a', role: 'ADMIN' as const, companyId: 'co1' };
const SA = { userId: 'sa', role: 'SUPER_ADMIN' as const, companyId: null };

function deps() {
  const prisma = {
    user: { findUnique: jest.fn(), update: jest.fn() },
    company: { findUnique: jest.fn() },
    sale: { aggregate: jest.fn() },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
    fn(prisma),
  );
  const audit = { record: jest.fn() };
  const cache = { invalidate: jest.fn(), invalidateCompany: jest.fn() };
  const logger = { info: jest.fn(), warn: jest.fn() };
  return { prisma, audit, cache, logger };
}

describe('Restablecer contraseña (soporte)', () => {
  it('el ADMIN restablece la de su vendedor: hash nuevo, temporal, sesión cerrada y auditado sin la clave', async () => {
    const d = deps();
    d.prisma.user.findUnique.mockResolvedValue({
      id: 'v1',
      role: 'SELLER',
      companyId: 'co1',
    });
    const svc = new UsersService(
      d.prisma as unknown as PrismaService,
      d.logger as unknown as AppLogger,
      d.cache as unknown as UserStatusCache,
      d.audit as unknown as AuditService,
    );
    await expect(
      svc.resetSellerPassword('v1', 'Temporal-99887', 'co1', ADMIN),
    ).resolves.toEqual({ reset: true });
    const data = (
      d.prisma.user.update.mock.calls[0] as [
        { data: { mustChangePassword: boolean; passwordHash: string } },
      ]
    )[0].data;
    expect(data.mustChangePassword).toBe(true);
    expect(await verifyPassword('Temporal-99887', data.passwordHash)).toBe(
      true,
    );
    expect(d.cache.invalidate).toHaveBeenCalledWith('v1');
    expect(d.audit.record).toHaveBeenCalledWith(
      ADMIN,
      expect.objectContaining({
        action: 'USER_PASSWORD_RESET',
        entityId: 'v1',
      }),
      d.prisma,
    );
    expect(
      JSON.stringify([d.audit.record.mock.calls, d.logger.info.mock.calls]),
    ).not.toContain('Temporal-99887');
  });

  it('el ADMIN no restablece la de otro ADMIN ni la de otra empresa', async () => {
    const d = deps();
    const svc = new UsersService(
      d.prisma as unknown as PrismaService,
      d.logger as unknown as AppLogger,
      d.cache as unknown as UserStatusCache,
      d.audit as unknown as AuditService,
    );
    d.prisma.user.findUnique.mockResolvedValueOnce({
      id: 'a2',
      role: 'ADMIN',
      companyId: 'co1',
    });
    await expect(
      svc.resetSellerPassword('a2', 'Temporal-99887', 'co1', ADMIN),
    ).rejects.toBeInstanceOf(NotFoundException);
    d.prisma.user.findUnique.mockResolvedValueOnce({
      id: 'v9',
      role: 'SELLER',
      companyId: 'co2',
    });
    await expect(
      svc.resetSellerPassword('v9', 'Temporal-99887', 'co1', ADMIN),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(d.prisma.user.update).not.toHaveBeenCalled();
  });

  it('el SUPER_ADMIN restablece la de cualquier usuario de empresa, pero no la de otro SUPER_ADMIN', async () => {
    const d = deps();
    const svc = new PlatformService(
      d.prisma as unknown as PrismaService,
      d.logger as unknown as AppLogger,
      d.cache as unknown as UserStatusCache,
      d.audit as unknown as AuditService,
    );
    d.prisma.user.findUnique.mockResolvedValueOnce({
      id: 'a1',
      companyId: 'co1',
    });
    await svc.resetUserPassword('a1', 'Temporal-99887', SA);
    expect(d.audit.record).toHaveBeenCalledWith(
      SA,
      expect.objectContaining({
        companyId: 'co1',
        action: 'USER_PASSWORD_RESET',
      }),
      d.prisma,
    );
    d.prisma.user.findUnique.mockResolvedValueOnce({
      id: 'sa2',
      companyId: null,
    });
    await expect(
      svc.resetUserPassword('sa2', 'Temporal-99887', SA),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('el detalle de empresa suma solo las ventas confirmadas', async () => {
    const d = deps();
    const svc = new PlatformService(
      d.prisma as unknown as PrismaService,
      d.logger as unknown as AppLogger,
      d.cache as unknown as UserStatusCache,
      d.audit as unknown as AuditService,
    );
    d.prisma.company.findUnique.mockResolvedValue({ id: 'co1', users: [] });
    d.prisma.sale.aggregate.mockResolvedValue({
      _count: 3,
      _sum: { total: 22500 },
    });
    await expect(svc.getCompanyDetail('co1')).resolves.toMatchObject({
      stats: { confirmedSales: 3, salesTotal: 22500 },
    });
    expect(d.prisma.sale.aggregate.mock.calls[0][0].where).toEqual({
      companyId: 'co1',
      status: 'CONFIRMED',
    });
  });
});
