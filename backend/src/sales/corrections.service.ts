import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/decorators';
import { AppLogger } from '../common/logger/app-logger.service';
import { PrismaService } from '../prisma/prisma.service';
import { assertSameCompany } from '../tenancy/tenant';

/**
 * SWR-SALE-V03: el vendedor no anula; pide la corrección de una venta suya con un
 * motivo y el ADMIN la resuelve (anulando o reemitiendo la venta, o rechazando).
 */
@Injectable()
export class CorrectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly logger: AppLogger,
  ) {}

  async request(
    saleId: string,
    reason: string,
    companyId: string,
    actor: AuthUser,
  ) {
    const found = await this.prisma.sale.findUnique({ where: { id: saleId } });
    const sale = assertSameCompany(
      found,
      companyId,
      this.logger,
      { entity: 'Sale', id: saleId, userId: actor.userId },
      'Venta no encontrada',
    );
    // Un vendedor solo pide corregir sus propias ventas (no revela las de otros).
    if (actor.role === 'SELLER' && sale.userId !== actor.userId)
      throw new NotFoundException('Venta no encontrada');
    if (sale.status === 'VOIDED')
      throw new ConflictException('La venta ya está anulada');
    const pending = await this.prisma.saleCorrectionRequest.count({
      where: { saleId, status: 'PENDING' },
    });
    if (pending > 0)
      throw new ConflictException(
        'Ya hay una solicitud de corrección pendiente para esta venta',
      );
    return this.prisma.$transaction(async (tx) => {
      const req = await tx.saleCorrectionRequest.create({
        data: { companyId, saleId, requestedById: actor.userId, reason },
      });
      await this.audit.record(
        actor,
        {
          companyId,
          action: 'SALE_CORRECTION_REQUESTED',
          entity: 'Sale',
          entityId: saleId,
          after: { invoiceNumber: sale.invoiceNumber },
          reason,
        },
        tx,
      );
      return req;
    });
  }

  /** ADMIN: solicitudes de la empresa (pendientes por defecto). Vendedor: las suyas. */
  async list(companyId: string, user: AuthUser, status?: string) {
    const where = {
      companyId,
      ...(user.role === 'SELLER' ? { requestedById: user.userId } : {}),
      ...(status === 'ALL'
        ? {}
        : {
            status: (status ?? 'PENDING') as
              'PENDING' | 'APPROVED' | 'REJECTED',
          }),
    };
    const rows = await this.prisma.saleCorrectionRequest.findMany({
      where,
      include: {
        sale: {
          select: {
            id: true,
            invoiceNumber: true,
            total: true,
            status: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const users = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(rows.map((r) => r.requestedById))] } },
      select: { id: true, name: true },
    });
    const names = new Map(users.map((u) => [u.id, u.name]));
    return rows.map((r) => ({
      ...r,
      requestedByName: names.get(r.requestedById) ?? null,
    }));
  }

  async reject(
    requestId: string,
    resolution: string | undefined,
    companyId: string,
    actor: AuthUser,
  ) {
    const found = await this.prisma.saleCorrectionRequest.findUnique({
      where: { id: requestId },
    });
    const req = assertSameCompany(
      found,
      companyId,
      this.logger,
      { entity: 'SaleCorrectionRequest', id: requestId, userId: actor.userId },
      'Solicitud no encontrada',
    );
    return this.prisma.$transaction(async (tx) => {
      const res = await tx.saleCorrectionRequest.updateMany({
        where: { id: requestId, status: 'PENDING' },
        data: {
          status: 'REJECTED',
          resolvedById: actor.userId,
          resolvedAt: new Date(),
          resolution,
        },
      });
      if (res.count === 0)
        throw new ConflictException('La solicitud ya fue resuelta');
      await this.audit.record(
        actor,
        {
          companyId,
          action: 'SALE_CORRECTION_REJECTED',
          entity: 'Sale',
          entityId: req.saleId,
          reason: resolution,
        },
        tx,
      );
      return { id: requestId, status: 'REJECTED' };
    });
  }
}
