import { Injectable } from '@nestjs/common';
import { EmailKind } from '@prisma/client';
import { AppLogger } from '../common/logger/app-logger.service';
import { MailService } from '../mail/mail.service';
import { invoiceMail } from '../mail/templates';
import { PrismaService } from '../prisma/prisma.service';

export type SendOutcome =
  | { status: 'SENT'; to: string; messageId: string }
  | { status: 'FAILED'; to: string; error: string }
  | { status: 'SKIPPED'; reason: string };

/**
 * SWR-MAIL-002: envía la factura (o la corregida, o el aviso de anulación) al cliente.
 * - Si falla el envío, la venta NO se revierte: queda el intento registrado y se puede reintentar.
 * - No se envía a nombre de una empresa cuyo correo no está verificado (SWR-MAIL-001).
 * - Cada intento queda en InvoiceEmail y en los logs (INVOICE_SENT / INVOICE_SEND_FAILED).
 */
@Injectable()
export class InvoiceMailerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly logger: AppLogger,
  ) {}

  /** Envío en segundo plano: la respuesta de la venta no espera al correo. */
  queue(saleId: string, kind: EmailKind, to?: string): void {
    this.send(saleId, kind, to).catch((e: Error) =>
      this.logger.error(
        'InvoiceMailerService',
        'INVOICE_SEND_FAILED',
        'Error inesperado al enviar',
        {
          saleId,
          error: e.message,
        },
      ),
    );
  }

  async send(
    saleId: string,
    kind: EmailKind,
    toOverride?: string,
  ): Promise<SendOutcome> {
    const sale = await this.prisma.sale.findUniqueOrThrow({
      where: { id: saleId },
      include: {
        items: { include: { product: { select: { name: true } } } },
        user: { select: { name: true } },
        correctsSale: { select: { invoiceNumber: true } },
        company: {
          select: {
            tradeName: true,
            taxId: true,
            address: true,
            city: true,
            phone: true,
            email: true,
            emailVerifiedAt: true,
            invoiceFooter: true,
          },
        },
      },
    });
    const to = toOverride ?? sale.customerEmail;
    if (!to)
      return {
        status: 'SKIPPED',
        reason: 'La venta no tiene correo del cliente',
      };

    const record = async (
      status: 'SENT' | 'FAILED',
      extra: { error?: string; messageId?: string },
    ) =>
      this.prisma.invoiceEmail.create({
        data: { companyId: sale.companyId, saleId, to, kind, status, ...extra },
      });

    if (!sale.company.emailVerifiedAt || !sale.company.email) {
      const error = 'El correo de la empresa no está verificado';
      await record('FAILED', { error });
      this.logger.warn(
        'InvoiceMailerService',
        'INVOICE_SEND_FAILED',
        'Factura no enviada',
        {
          saleId,
          kind,
          reason: 'COMPANY_EMAIL_NOT_VERIFIED',
        },
      );
      return { status: 'FAILED', to, error };
    }

    const { subject, html, text } = invoiceMail(
      kind,
      {
        invoiceNumber: sale.invoiceNumber,
        createdAt: sale.createdAt,
        paymentMethod: sale.paymentMethod,
        total: sale.total,
        sellerName: sale.user.name,
        voidReason: sale.voidReason,
        correctsInvoice: sale.correctsSale?.invoiceNumber ?? null,
        items: sale.items.map((i) => ({
          name: i.product.name,
          quantity: Number(i.quantity),
          unit: i.unit,
          unitPrice: i.unitPrice,
          subtotal: i.subtotal,
        })),
      },
      sale.company,
    );
    const started = Date.now();
    try {
      const { messageId } = await this.mail.send({
        fromName: sale.company.tradeName,
        replyTo: sale.company.email,
        to,
        subject,
        html,
        text,
      });
      await record('SENT', { messageId });
      this.logger.info(
        'InvoiceMailerService',
        'INVOICE_SENT',
        'Factura enviada por correo',
        {
          saleId,
          kind,
          invoiceNumber: sale.invoiceNumber,
          durationMs: Date.now() - started,
        },
      );
      return { status: 'SENT', to, messageId };
    } catch (e) {
      const error = (e as Error).message.slice(0, 300);
      await record('FAILED', { error });
      this.logger.warn(
        'InvoiceMailerService',
        'INVOICE_SEND_FAILED',
        'No se pudo enviar la factura',
        {
          saleId,
          kind,
          error,
        },
      );
      return { status: 'FAILED', to, error };
    }
  }

  /** Último destinatario al que sí se le envió la factura (para el aviso de anulación). */
  async lastDeliveredTo(saleId: string): Promise<string | null> {
    const last = await this.prisma.invoiceEmail.findFirst({
      where: { saleId, status: 'SENT', kind: { in: ['INVOICE', 'REISSUE'] } },
      orderBy: { createdAt: 'desc' },
    });
    return last?.to ?? null;
  }

  history(saleId: string) {
    return this.prisma.invoiceEmail.findMany({
      where: { saleId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        to: true,
        kind: true,
        status: true,
        error: true,
        createdAt: true,
      },
    });
  }
}
