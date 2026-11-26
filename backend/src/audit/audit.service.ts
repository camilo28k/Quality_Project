import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthUser } from '../auth/decorators';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEntry {
  companyId: string | null;
  action: string;
  entity: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
}

type Db = Pick<Prisma.TransactionClient, 'auditLog'>;

/** Campos que nunca se guardan en la auditoría. */
const SECRET_KEYS = new Set(['passwordHash', 'password', 'temporaryPassword']);

/** Copia JSON sin secretos; Decimal y Date quedan como texto. */
export function auditSnapshot(
  value: unknown,
): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return JSON.parse(
    JSON.stringify(value, (k, v: unknown) =>
      SECRET_KEYS.has(k) ? undefined : v,
    ),
  ) as Prisma.InputJsonValue;
}

/** Solo los campos que cambiaron, para que antes/después se lean fácil. */
export function changedFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): { before: Record<string, unknown>; after: Record<string, unknown> } {
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  for (const key of Object.keys(after)) {
    if (key === 'updatedAt') continue;
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      b[key] = before[key];
      a[key] = after[key];
    }
  }
  return { before: b, after: a };
}

/**
 * SWR-AUD-001: registro inmutable de quién hizo qué, en qué empresa, con el antes y el después.
 * Se escribe en la misma transacción que el cambio cuando se pasa `db`.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  record(
    actor: Pick<AuthUser, 'userId' | 'role'>,
    entry: AuditEntry,
    db: Db = this.prisma,
  ) {
    return db.auditLog.create({
      data: {
        companyId: entry.companyId,
        userId: actor.userId,
        role: actor.role,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId,
        before: auditSnapshot(entry.before),
        after: auditSnapshot(entry.after),
        reason: entry.reason ?? null,
      },
    });
  }

  /** ADMIN: su empresa. SUPER_ADMIN: todas o una empresa concreta. Más recientes primero. */
  async list(params: {
    companyId?: string | null;
    entity?: string;
    action?: string;
    cursor?: string;
    take?: number;
  }) {
    const take = Math.min(Math.max(params.take ?? 50, 1), 100);
    const where: Prisma.AuditLogWhereInput = {
      ...(params.companyId !== undefined
        ? { companyId: params.companyId }
        : {}),
      ...(params.entity ? { entity: params.entity } : {}),
      ...(params.action ? { action: params.action } : {}),
    };
    const rows = await this.prisma.auditLog.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
    });
    const userIds = [...new Set(rows.map((r) => r.userId))];
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true },
    });
    const names = new Map(users.map((u) => [u.id, u.name]));
    const page = rows.slice(0, take);
    return {
      items: page.map((r) => ({ ...r, userName: names.get(r.userId) ?? null })),
      nextCursor: rows.length > take ? page[page.length - 1].id : null,
    };
  }
}
