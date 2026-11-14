import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AppLogger } from '../common/logger/app-logger.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService, INVALID_CREDENTIALS } from './auth.service';
import { hashPassword } from './password.util';

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
    service = new AuthService(prisma, jwt, logger as unknown as AppLogger);
  });

  const activeUser = () => ({
    id: 'u1',
    name: 'Admin',
    email: 'admin@tienda.test',
    role: 'ADMIN',
    active: true,
    passwordHash,
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
