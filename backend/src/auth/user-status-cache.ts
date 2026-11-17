import type { Role } from '@prisma/client';

export interface UserStatus {
  id: string;
  role: Role;
  active: boolean;
}

/**
 * Caché corta del estado de las cuentas (FAL-01).
 * Validar la sesión consultaba la BD en cada solicitud (~580 ms con Supabase).
 * Compromiso documentado: un cambio de rol o una desactivación tarda como
 * máximo `ttlMs` en surtir efecto en sesiones ya abiertas.
 */
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
    // Las cuentas inexistentes o inactivas no se guardan: se vuelven a consultar.
    if (value?.active) {
      this.entries.set(userId, { value, expires: this.now() + this.ttlMs });
    } else {
      this.entries.delete(userId);
    }
    return value;
  }
}
