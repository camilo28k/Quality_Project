import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AppLogger } from '../common/logger/app-logger.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService, INVALID_CREDENTIALS } from './auth.service';
import { hashPassword, verifyPassword } from './password.util';
import { UserStatusCache } from './user-status-cache';

describe('AuthService.login (SWR-AUTH-001, SWR-AUTH-002)', () => {
  let service: AuthService;
  let findUnique: jest.Mock;
  let logger: { info: jest.Mock; warn: jest.Mock };
  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await hashPassword('Clave-Correcta-1');
  });

  beforeEach(() => {
    findUnique = jest.fn();
    logger = { info: jest.fn(), warn: jest.fn() };
    const prisma = { user: { findUnique } } as unknown as PrismaService;
    const jwt = {
      signAsync: jest.fn().mockResolvedValue('token-firmado'),
    } as unknown as JwtService;
    service = new AuthService(
      prisma,
      jwt,
      logger as unknown as AppLogger,
      { invalidate: jest.fn() } as unknown as UserStatusCache,
    );
  });

  const activeUser = () => ({
    id: 'u1',
    name: 'Admin',
    email: 'admin@tienda.test',
    role: 'ADMIN',
    active: true,
    passwordHash,
    companyId: 'co1',
    mustChangePassword: false,
    company: { active: true },
  });

  it('devuelve token y datos públicos con credenciales válidas de cuenta activa', async () => {
    // Arrange
    findUnique.mockResolvedValue(activeUser());
    // Act
    const result = await service.login('admin@tienda.test', 'Clave-Correcta-1');
    // Assert
    expect(result.accessToken).toBe('token-firmado');
    expect(result.user).toEqual({
      id: 'u1',
      name: 'Admin',
      email: 'admin@tienda.test',
      role: 'ADMIN',
      companyId: 'co1',
      mustChangePassword: false,
    });
    expect(result.user).not.toHaveProperty('passwordHash');
    expect(logger.info).toHaveBeenCalledWith(
      'AuthService',
      'AUTH_LOGIN_SUCCESS',
      expect.any(String),
      expect.any(Object),
    );
  });

  it('rechaza contraseña incorrecta con mensaje general', async () => {
    findUnique.mockResolvedValue(activeUser());
    await expect(service.login('admin@tienda.test', 'otra')).rejects.toThrow(
      new UnauthorizedException(INVALID_CREDENTIALS),
    );
  });

  it('rechaza correo inexistente con el mismo mensaje (no revela si existe)', async () => {
    findUnique.mockResolvedValue(null);
    await expect(
      service.login('nadie@tienda.test', 'Clave-Correcta-1'),
    ).rejects.toThrow(INVALID_CREDENTIALS);
  });

  it('rechaza cuenta inactiva aunque la contraseña sea correcta', async () => {
    findUnique.mockResolvedValue({ ...activeUser(), active: false });
    await expect(
      service.login('admin@tienda.test', 'Clave-Correcta-1'),
    ).rejects.toThrow(INVALID_CREDENTIALS);
  });

  it('SWR-TEN-003: rechaza el inicio de sesión si la empresa está desactivada', async () => {
    findUnique.mockResolvedValue({
      ...activeUser(),
      company: { active: false },
    });
    await expect(
      service.login('admin@tienda.test', 'Clave-Correcta-1'),
    ).rejects.toThrow(INVALID_CREDENTIALS);
    expect(JSON.stringify(logger.warn.mock.calls)).toContain(
      'COMPANY_INACTIVE',
    );
  });

  it('el SUPER_ADMIN no tiene empresa y puede iniciar sesión', async () => {
    findUnique.mockResolvedValue({
      ...activeUser(),
      role: 'SUPER_ADMIN',
      companyId: null,
      company: null,
    });
    const result = await service.login('admin@tienda.test', 'Clave-Correcta-1');
    expect(result.user).toMatchObject({ role: 'SUPER_ADMIN', companyId: null });
  });

  it('registra el fallo sin incluir la contraseña en los logs', async () => {
    findUnique.mockResolvedValue(activeUser());
    await expect(
      service.login('admin@tienda.test', 'secreto-intentado'),
    ).rejects.toThrow();
    const logged = JSON.stringify(logger.warn.mock.calls);
    expect(logged).toContain('AUTH_LOGIN_FAILED');
    expect(logged).toContain('BAD_PASSWORD');
    expect(logged).not.toContain('secreto-intentado');
  });
});

/** SWR-ONB-001: cambio de contraseña. */
describe('AuthService.changePassword', () => {
  let user: { findUniqueOrThrow: jest.Mock; update: jest.Mock };
  let cache: { invalidate: jest.Mock };
  let logger: { info: jest.Mock; warn: jest.Mock };
  let service: AuthService;

  beforeEach(async () => {
    user = {
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        passwordHash: await hashPassword('Temporal-123'),
      }),
      update: jest.fn().mockResolvedValue({}),
    };
    cache = { invalidate: jest.fn() };
    logger = { info: jest.fn(), warn: jest.fn() };
    service = new AuthService(
      { user } as unknown as PrismaService,
      {} as JwtService,
      logger as unknown as AppLogger,
      cache as unknown as UserStatusCache,
    );
  });

  it('con la contraseña actual correcta guarda el hash nuevo, quita la marca temporal e invalida la caché', async () => {
    await expect(
      service.changePassword('u1', 'Temporal-123', 'Nueva-Clave-456'),
    ).resolves.toEqual({ changed: true });
    const data = (
      user.update.mock.calls[0] as [
        { data: { mustChangePassword: boolean; passwordHash: string } },
      ]
    )[0].data;
    expect(data.mustChangePassword).toBe(false);
    expect(await verifyPassword('Nueva-Clave-456', data.passwordHash)).toBe(
      true,
    );
    expect(cache.invalidate).toHaveBeenCalledWith('u1');
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain(
      'Nueva-Clave-456',
    );
  });

  it('rechaza si la contraseña actual es incorrecta y no modifica nada', async () => {
    await expect(
      service.changePassword('u1', 'otra-cosa', 'Nueva-Clave-456'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(user.update).not.toHaveBeenCalled();
    expect(JSON.stringify(logger.warn.mock.calls)).toContain(
      'BAD_CURRENT_PASSWORD',
    );
  });

  it('rechaza reutilizar la misma contraseña', async () => {
    const err = await service
      .changePassword('u1', 'Temporal-123', 'Temporal-123')
      .catch((e: BadRequestException) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect(
      JSON.stringify((err as BadRequestException).getResponse()),
    ).toContain('distinta');
    expect(user.update).not.toHaveBeenCalled();
  });
});
