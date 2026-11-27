import { AppLogger } from '../common/logger/app-logger.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { InvoiceMailerService } from './invoice-mailer.service';

const sale = (over: object = {}, company: object = {}) => ({
  id: 's1',
  companyId: 'co1',
  invoiceNumber: 'DR-100',
  createdAt: new Date(),
  paymentMethod: 'CASH',
  total: 7500,
  customerEmail: 'cliente@correo.test',
  voidReason: null,
  user: { name: 'Carlos' },
  correctsSale: null,
  items: [
    {
      quantity: 3,
      unit: 'UNIT',
      unitPrice: 2500,
      subtotal: 7500,
      product: { name: 'Arroz' },
    },
  ],
  company: {
    tradeName: 'Doña Rosa',
    email: 'ventas@rosa.test',
    emailVerifiedAt: new Date(),
    taxId: null,
    address: null,
    city: null,
    phone: null,
    invoiceFooter: null,
    ...company,
  },
  ...over,
});

/** SWR-MAIL-002 */
describe('InvoiceMailerService', () => {
  let prisma: {
    sale: { findUniqueOrThrow: jest.Mock };
    invoiceEmail: {
      create: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
    };
  };
  let mail: { send: jest.Mock };
  let logger: { info: jest.Mock; warn: jest.Mock; error: jest.Mock };
  let service: InvoiceMailerService;

  beforeEach(() => {
    prisma = {
      sale: { findUniqueOrThrow: jest.fn().mockResolvedValue(sale()) },
      invoiceEmail: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
    };
    mail = { send: jest.fn().mockResolvedValue({ messageId: '<m1>' }) };
    logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    service = new InvoiceMailerService(
      prisma as unknown as PrismaService,
      mail as unknown as MailService,
      logger as unknown as AppLogger,
    );
  });

  it('envía a nombre de la empresa con Reply-To a su correo verificado y registra SENT + INVOICE_SENT', async () => {
    await expect(service.send('s1', 'INVOICE')).resolves.toMatchObject({
      status: 'SENT',
      to: 'cliente@correo.test',
    });
    expect(mail.send.mock.calls[0][0]).toMatchObject({
      fromName: 'Doña Rosa',
      replyTo: 'ventas@rosa.test',
      to: 'cliente@correo.test',
      subject: 'Factura DR-100 de Doña Rosa',
    });
    expect(prisma.invoiceEmail.create.mock.calls[0][0].data).toMatchObject({
      status: 'SENT',
      kind: 'INVOICE',
      messageId: '<m1>',
    });
    expect(logger.info).toHaveBeenCalledWith(
      'InvoiceMailerService',
      'INVOICE_SENT',
      expect.any(String),
      expect.any(Object),
    );
  });

  it('si el SMTP falla no lanza: registra FAILED con el error e INVOICE_SEND_FAILED (la venta no se revierte)', async () => {
    mail.send.mockRejectedValue(new Error('ECONNREFUSED 127.0.0.1:1025'));
    await expect(service.send('s1', 'INVOICE')).resolves.toMatchObject({
      status: 'FAILED',
      error: expect.stringContaining('ECONNREFUSED'),
    });
    expect(prisma.invoiceEmail.create.mock.calls[0][0].data).toMatchObject({
      status: 'FAILED',
    });
    expect(logger.warn).toHaveBeenCalledWith(
      'InvoiceMailerService',
      'INVOICE_SEND_FAILED',
      expect.any(String),
      expect.any(Object),
    );
  });

  it('no envía a nombre de una empresa con el correo sin verificar (SWR-MAIL-001)', async () => {
    prisma.sale.findUniqueOrThrow.mockResolvedValue(
      sale({}, { emailVerifiedAt: null }),
    );
    await expect(service.send('s1', 'INVOICE')).resolves.toMatchObject({
      status: 'FAILED',
      error: 'El correo de la empresa no está verificado',
    });
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('sin correo del cliente no hace nada; con destinatario explícito usa ese', async () => {
    prisma.sale.findUniqueOrThrow.mockResolvedValue(
      sale({ customerEmail: null }),
    );
    await expect(service.send('s1', 'INVOICE')).resolves.toMatchObject({
      status: 'SKIPPED',
    });
    expect(prisma.invoiceEmail.create).not.toHaveBeenCalled();
    await service.send('s1', 'INVOICE', 'otro@correo.test');
    expect(mail.send.mock.calls[0][0].to).toBe('otro@correo.test');
  });

  it('queue no propaga errores inesperados (solo los registra)', async () => {
    prisma.sale.findUniqueOrThrow.mockRejectedValue(new Error('BD caída'));
    service.queue('s1', 'INVOICE');
    await new Promise((r) => setImmediate(r));
    expect(logger.error).toHaveBeenCalledWith(
      'InvoiceMailerService',
      'INVOICE_SEND_FAILED',
      expect.any(String),
      expect.objectContaining({ error: 'BD caída' }),
    );
  });

  it('lastDeliveredTo devuelve el último destinatario que sí recibió la factura', async () => {
    prisma.invoiceEmail.findFirst.mockResolvedValue({
      to: 'cliente@correo.test',
    });
    await expect(service.lastDeliveredTo('s1')).resolves.toBe(
      'cliente@correo.test',
    );
    expect(prisma.invoiceEmail.findFirst.mock.calls[0][0].where).toEqual({
      saleId: 's1',
      status: 'SENT',
      kind: { in: ['INVOICE', 'REISSUE'] },
    });
  });
});
