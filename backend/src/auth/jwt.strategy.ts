import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Role } from '@prisma/client';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from './decorators';
import { canOperate, UserStatus, UserStatusCache } from './user-status-cache';

interface JwtPayload {
  sub: string;
  role: Role;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly cache: UserStatusCache,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  /**
   * Revalida que la cuenta y su empresa sigan activas y usa el rol y la empresa
   * actuales de la BD (no los del token), con caché de 30 s (FAL-01, SWR-TEN-003).
   */
  async validate(payload: JwtPayload): Promise<AuthUser> {
    const user = await this.cache.get(payload.sub, (id) => this.load(id));
    if (!canOperate(user)) throw new UnauthorizedException('Sesión no válida');
    return { userId: user.id, role: user.role, companyId: user.companyId };
  }

  private async load(id: string): Promise<UserStatus | null> {
    const u = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        role: true,
        active: true,
        companyId: true,
        company: { select: { active: true } },
      },
    });
    if (!u) return null;
    return {
      id: u.id,
      role: u.role,
      active: u.active,
      companyId: u.companyId,
      companyActive: u.company?.active ?? u.role === 'SUPER_ADMIN',
    };
  }
}
