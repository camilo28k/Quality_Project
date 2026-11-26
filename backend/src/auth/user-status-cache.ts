import { Injectable } from '@nestjs/common';
import type { Role } from '@prisma/client';

export interface UserStatus {
  id: string;
  role: Role;
  active: boolean;
  companyId: string | null;
  /** Estado de la empresa; true para el SUPER_ADMIN, que no tiene empresa. */
  companyActive: boolean;
}

/** La cuenta puede operar: activa y, si pertenece a una empresa, con la empresa activa (SWR-TEN-003). */
export function canOperate(status: UserStatus | null): status is UserStatus {
  return !!status && status.active && status.companyActive;
}

/**
 * Caché corta del estado de las cuentas (FAL-01).
 * Validar la sesión consultaba la BD en cada solicitud (~580 ms con Supabase).
 * Al desactivar una cuenta o una empresa desde la aplicación se invalida al momento;
 * un cambio hecho directamente en la BD tarda como máximo `ttlMs` en surtir efecto.
 */
@Injectable()
export class UserStatusCache {
  private readonly entries = new Map<
    string,
    { value: UserStatus | null; expires: number }
  >();

  constructor(
    private readonly ttlMs = 30_000,
    private readonly now: () => number = Date.now,
  ) {}

  async get(
    userId: string,
    load: (id: string) => Promise<UserStatus | null>,
  ): Promise<UserStatus | null> {
    const hit = this.entries.get(userId);
    if (hit && hit.expires > this.now()) return hit.value;
    const value = await load(userId);
    // Las cuentas que no pueden operar no se guardan: se vuelven a consultar.
    if (canOperate(value)) {
      this.entries.set(userId, { value, expires: this.now() + this.ttlMs });
    } else {
      this.entries.delete(userId);
    }
    return value;
  }

  /** Olvida una cuenta (p. ej. al desactivarla o cambiarle el rol). */
  invalidate(userId: string): void {
    this.entries.delete(userId);
  }

  /** Olvida todas las cuentas de una empresa (p. ej. al desactivarla). */
  invalidateCompany(companyId: string): void {
    for (const [id, e] of this.entries) {
      if (e.value?.companyId === companyId) this.entries.delete(id);
    }
  }
}
