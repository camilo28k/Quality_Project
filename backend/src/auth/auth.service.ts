import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Role } from '@prisma/client';
import { AppLogger } from '../common/logger/app-logger.service';
import { PrismaService } from '../prisma/prisma.service';
import { verifyPassword } from './password.util';

export const INVALID_CREDENTIALS = 'Correo o contraseña incorrectos';

export interface LoginResult {
  accessToken: string;
  user: { id: string; name: string; email: string; role: Role };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly logger: AppLogger,
  ) {}

  /**
   * SWR-AUTH-001: inicia sesión con correo y contraseña de una cuenta activa.
   * SWR-AUTH-002: rechaza con un mensaje general, sin revelar si el correo existe.
   */
  async login(email: string, password: string): Promise<LoginResult> {
    const started = Date.now();
    const user = await this.prisma.user.findUnique({ where: { email } });

    const valid =
      !!user &&
      user.active &&
      (await verifyPassword(password, user.passwordHash));
    if (!user || !valid) {
      this.logger.warn(
        'AuthService',
        'AUTH_LOGIN_FAILED',
        'Inicio de sesión rechazado',
        {
          reason: !user
            ? 'USER_NOT_FOUND'
            : !user.active
              ? 'USER_INACTIVE'
              : 'BAD_PASSWORD',
          userId: user?.id,
          durationMs: Date.now() - started,
        },
      );
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      role: user.role,
    });
    this.logger.info(
      'AuthService',
      'AUTH_LOGIN_SUCCESS',
      'Inicio de sesión correcto',
      {
        userId: user.id,
        role: user.role,
        durationMs: Date.now() - started,
      },
    );
    return {
      accessToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  }

  async me(userId: string) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, name: true, email: true, role: true },
    });
  }
}
