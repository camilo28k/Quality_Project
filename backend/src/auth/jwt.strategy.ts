import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Role } from '@prisma/client';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from './decorators';
import { UserStatusCache } from './user-status-cache';

interface JwtPayload {
  sub: string;
  role: Role;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  private readonly cache = new UserStatusCache();

  /**
   * Revalida que la cuenta siga activa y usa el rol actual de la BD,
   * con una caché de 30 s para no consultar la BD en cada solicitud (FAL-01).
   */
  async validate(payload: JwtPayload): Promise<AuthUser> {
    const user = await this.cache.get(payload.sub, (id) =>
      this.prisma.user.findUnique({
        where: { id },
        select: { id: true, role: true, active: true },
      }),
    );
    if (!user || !user.active)
      throw new UnauthorizedException('Sesión no válida');
    return { userId: user.id, role: user.role };
  }
}
