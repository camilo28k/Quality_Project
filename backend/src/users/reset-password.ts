import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/decorators';
import { hashPassword } from '../auth/password.util';
import { UserStatusCache } from '../auth/user-status-cache';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Restablece la contraseña con una temporal (mustChangePassword = true), cierra la
 * sesión abierta del usuario y lo deja en la auditoría. Nunca se guarda ni registra
 * la contraseña en claro.
 */
export async function resetPassword(
  prisma: PrismaService,
  audit: AuditService,
  cache: UserStatusCache,
  args: {
    userId: string;
    companyId: string;
    temporaryPassword: string;
    actor: AuthUser;
  },
) {
  const passwordHash = await hashPassword(args.temporaryPassword);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: args.userId },
      data: { passwordHash, mustChangePassword: true },
    });
    await audit.record(
      args.actor,
      {
        companyId: args.companyId,
        action: 'USER_PASSWORD_RESET',
        entity: 'User',
        entityId: args.userId,
        after: { mustChangePassword: true },
      },
      tx,
    );
  });
  cache.invalidate(args.userId);
}
