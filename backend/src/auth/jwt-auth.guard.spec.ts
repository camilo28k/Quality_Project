import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppLogger } from '../common/logger/app-logger.service';
import { JwtAuthGuard, tokenRejectionReason } from './jwt-auth.guard';

// @nestjs/passport 12 se publica solo como ESM y Jest (CommonJS) no lo carga.
// Se reemplaza por una clase base mínima: lo que se prueba es la lógica propia del guard.
jest.mock('@nestjs/passport', () => ({
  AuthGuard: () =>
    class {
      canActivate() {
        return true;
      }
    },
}));

describe('tokenRejectionReason (MEJ-01)', () => {
  const named = (name: string, message = '') =>
    Object.assign(new Error(message), { name });

  it('token vencido', () => {
    expect(tokenRejectionReason(null, named('TokenExpiredError'))).toBe(
      'TOKEN_EXPIRED',
    );
  });

  it('token alterado o con firma inválida', () => {
    expect(tokenRejectionReason(null, named('JsonWebTokenError'))).toBe(
      'TOKEN_INVALID',
    );
  });

  it('solicitud sin token', () => {
    expect(tokenRejectionReason(null, new Error('No auth token'))).toBe(
      'TOKEN_MISSING',
    );
  });

  it('cuenta desactivada o inexistente (validate lanza error)', () => {
    expect(tokenRejectionReason(new UnauthorizedException(), undefined)).toBe(
      'UnauthorizedException',
    );
  });
});

describe('JwtAuthGuard.handleRequest (MEJ-01, H-SR-02)', () => {
  const context = {
    switchToHttp: () => ({
      getRequest: () => ({ method: 'GET', path: '/auth/me' }),
    }),
  } as unknown as ExecutionContext;

  it('registra el rechazo sin incluir el token y responde 401', () => {
    const logger = { warn: jest.fn() };
    const guard = new JwtAuthGuard(
      new Reflector(),
      logger as unknown as AppLogger,
    );
    const info = Object.assign(new Error('invalid signature'), {
      name: 'JsonWebTokenError',
    });

    expect(() => guard.handleRequest(null, false, info, context)).toThrow(
      UnauthorizedException,
    );
    expect(logger.warn).toHaveBeenCalledWith(
      'JwtAuthGuard',
      'AUTH_TOKEN_INVALID',
      expect.any(String),
      { reason: 'TOKEN_INVALID', method: 'GET', path: '/auth/me' },
    );
  });

  it('deja pasar al usuario válido sin registrar nada', () => {
    const logger = { warn: jest.fn() };
    const guard = new JwtAuthGuard(
      new Reflector(),
      logger as unknown as AppLogger,
    );
    const user = { userId: 'u1', role: 'ADMIN' as const };

    expect(guard.handleRequest(null, user, undefined, context)).toBe(user);
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
