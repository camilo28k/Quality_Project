import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/decorators';
import { AppLogger } from '../common/logger/app-logger.service';
import { PrismaService } from '../prisma/prisma.service';
import { assertSameCompany } from '../tenancy/tenant';
import { CatalogService, serializeProduct } from './catalog.service';
import {
  ApproveProductDto,
  PriceRequestDto,
  ResolveRequestDto,
} from './catalog.dto';

const REVIEW_DAYS = 30;

/**
 * Decisión a: el vendedor solo sugiere precios. El ADMIN aprueba productos
 * nuevos de vendedores y solicitudes de cambio de precio, y revisa los
 * cambios de precio recientes (panel de revisión).
 */
@Injectable()
export class ReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
    private readonly audit: AuditService,
    private readonly logger: AppLogger,
  ) {}

  async requestPriceChange(
    productId: string,
    dto: PriceRequestDto,
    companyId: string,
    actor: AuthUser,
  ) {
    const product = await this.catalog.findOrThrow(
      productId,
      companyId,
      actor.userId,
    );
    if (dto.proposedPrice === product.price)
      throw new BadRequestException(['El precio propuesto es igual al actual']);
    const pending = await this.prisma.priceChangeRequest.count({
      where: { productId, status: 'PENDING' },
    });
    if (pending > 0)
      throw new ConflictException(
        'Ya hay una solicitud de precio pendiente para este producto',
      );
    return this.prisma.$transaction(async (tx) => {
      const req = await tx.priceChangeRequest.create({
        data: {
          companyId,
          productId,
          requestedById: actor.userId,
          currentPrice: product.price,
          proposedPrice: dto.proposedPrice,
          reason: dto.reason,
        },
      });
      await this.audit.record(
        actor,
        {
          companyId,
          action: 'PRICE_CHANGE_REQUESTED',
          entity: 'Product',
          entityId: productId,
          before: { price: product.price },
          after: { proposedPrice: dto.proposedPrice },
          reason: dto.reason,
        },
        tx,
      );
      return req;
    });
  }

  async resolvePriceRequest(
    requestId: string,
    approve: boolean,
    dto: ResolveRequestDto,
    companyId: string,
    actor: AuthUser,
  ) {
    const found = await this.prisma.priceChangeRequest.findUnique({
      where: { id: requestId },
    });
    const req = assertSameCompany(
      found,
      companyId,
      this.logger,
      { entity: 'PriceChangeRequest', id: requestId, userId: actor.userId },
      'Solicitud no encontrada',
    );
    if (req.status !== 'PENDING')
      throw new ConflictException('La solicitud ya fue resuelta');

    return this.prisma.$transaction(async (tx) => {
      // Solo una resolución gana si dos administradores actúan a la vez.
      const res = await tx.priceChangeRequest.updateMany({
        where: { id: requestId, status: 'PENDING' },
        data: {
          status: approve ? 'APPROVED' : 'REJECTED',
          resolvedById: actor.userId,
          resolvedAt: new Date(),
        },
      });
      if (res.count === 0)
        throw new ConflictException('La solicitud ya fue resuelta');
      if (approve) {
        const before = await tx.product.findUniqueOrThrow({
          where: { id: req.productId },
        });
        await tx.product.update({
          where: { id: req.productId },
          data: { price: req.proposedPrice, updatedById: actor.userId },
        });
        await this.audit.record(
          actor,
          {
            companyId,
            action: 'PRODUCT_PRICE_CHANGED',
            entity: 'Product',
            entityId: req.productId,
            before: { price: before.price },
            after: { price: req.proposedPrice, requestId },
            reason: dto.reason,
          },
          tx,
        );
      } else {
        await this.audit.record(
          actor,
          {
            companyId,
            action: 'PRICE_CHANGE_REJECTED',
            entity: 'Product',
            entityId: req.productId,
            after: { proposedPrice: req.proposedPrice, requestId },
            reason: dto.reason,
          },
          tx,
        );
      }
      return { id: requestId, status: approve ? 'APPROVED' : 'REJECTED' };
    });
  }

  /** Aprueba un producto creado por un vendedor; opcionalmente con precio final. */
  async approveProduct(
    productId: string,
    dto: ApproveProductDto,
    companyId: string,
    actor: AuthUser,
  ) {
    const product = await this.catalog.findOrThrow(
      productId,
      companyId,
      actor.userId,
    );
    if (product.approved)
      throw new ConflictException('El producto ya está aprobado');
    const price = dto.price ?? product.price;
    const updated = await this.prisma.$transaction(async (tx) => {
      const p = await tx.product.update({
        where: { id: productId },
        data: { approved: true, price, updatedById: actor.userId },
        include: { category: { select: { id: true, name: true } } },
      });
      await this.audit.record(
        actor,
        {
          companyId,
          action: 'PRODUCT_APPROVED',
          entity: 'Product',
          entityId: productId,
          before: { approved: false, price: product.price },
          after: { approved: true, price },
        },
        tx,
      );
      return p;
    });
    return serializeProduct(updated);
  }

  /** Panel de revisión del ADMIN. */
  async summary(companyId: string) {
    const since = new Date(Date.now() - REVIEW_DAYS * 24 * 60 * 60 * 1000);
    const [pendingProducts, priceRequests, priceChanges] = await Promise.all([
      this.prisma.product.findMany({
        where: { companyId, approved: false },
        include: { category: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.priceChangeRequest.findMany({
        where: { companyId, status: 'PENDING' },
        include: { product: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.auditLog.findMany({
        where: {
          companyId,
          action: 'PRODUCT_PRICE_CHANGED',
          createdAt: { gte: since },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ]);
    const userIds = [
      ...new Set([
        ...pendingProducts.map((p) => p.createdById ?? ''),
        ...priceRequests.map((r) => r.requestedById),
        ...priceChanges.map((c) => c.userId),
      ]),
    ].filter(Boolean);
    const productIds = [...new Set(priceChanges.map((c) => c.entityId))];
    const [users, products] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true },
      }),
      this.prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, name: true },
      }),
    ]);
    const userName = new Map(users.map((u) => [u.id, u.name]));
    const productName = new Map(products.map((p) => [p.id, p.name]));
    return {
      pendingProducts: pendingProducts.map((p) => ({
        ...serializeProduct(p),
        createdByName: userName.get(p.createdById ?? '') ?? null,
      })),
      priceRequests: priceRequests.map((r) => ({
        ...r,
        requestedByName: userName.get(r.requestedById) ?? null,
      })),
      recentPriceChanges: priceChanges.map((c) => ({
        id: c.id,
        productId: c.entityId,
        productName: productName.get(c.entityId) ?? '(eliminado)',
        before: c.before,
        after: c.after,
        userName: userName.get(c.userId) ?? null,
        role: c.role,
        createdAt: c.createdAt,
      })),
    };
  }

  /** Solicitudes de precio del vendedor (para que vea su estado). */
  listMyRequests(companyId: string, userId: string) {
    return this.prisma.priceChangeRequest.findMany({
      where: { companyId, requestedById: userId },
      include: { product: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }
}
