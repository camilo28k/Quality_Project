import {
  BadRequestException,
  ConflictException,
  HttpException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { AppLogger } from '../common/logger/app-logger.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  EmailVerificationService,
  hashCode,
  MAX_ATTEMPTS,
} from './email-verification.service';

const ADMIN = { userId: 'u-a', role: 'ADMIN' as const, companyId: 'co1' };

/** SWR-MAIL-001 */
describe('EmailVerificationService', () => {
  let now: number;
  let prisma: {
    company: { findUniqueOrThrow: jest.Mock; update: jest.Mock };
    emailVerification: {
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let mail: { send: jest.Mock };
  let audit: { record: jest.Mock };
  let logger: { info: jest.Mock; warn: jest.Mock };
  let service: EmailVerificationService;

  beforeEach(() => {
    now = Date.parse('2026-11-27T12:00:00Z');
    prisma = {
      company: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          tradeName: 'Doña Rosa',
          email: 'ventas@rosa.test',
          emailVerifiedAt: null,
        }),
        update: jest.fn(),
      },
      emailVerification: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
      fn(prisma),
    );
    mail = { send: jest.fn().mockResolvedValue({ messageId: 'm1' }) };
    audit = { record: jest.fn() };
    logger = { info: jest.fn(), warn: jest.fn() };
    service = new EmailVerificationService(
      prisma as unknown as PrismaService,
      mail as unknown as MailService,
      audit as unknown as AuditService,
      logger as unknown as AppLogger,
      () => now,
    );
  });

  it('envía un código de 6 dígitos al correo de la empresa y guarda solo su hash, con 15 min de vigencia', async () => {
    await expect(service.sendCode('co1', ADMIN)).resolves.toEqual({
      sentTo: 'ventas@rosa.test',
      expiresInMinutes: 15,
    });
    const sent = mail.send.mock.calls[0][0] as { to: string; text: string };
    expect(sent.to).toBe('ventas@rosa.test');
    const code = /(\d{6})/.exec(sent.text)![1];
    const data = prisma.emailVerification.create.mock.calls[0][0].data;
    expect(data.codeHash).toBe(hashCode('co1', code));
    expect(JSON.stringify(data)).not.toContain(code);
    expect(data.expiresAt.getTime() - now).toBe(15 * 60 * 1000);
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain(code);
  });

  it('no reenvía antes de un minuto (429) ni si ya está verificado (409)', async () => {
    prisma.emailVerification.findFirst.mockResolvedValue({
      createdAt: new Date(now - 30_000),
    });
    await expect(service.sendCode('co1', ADMIN)).rejects.toBeInstanceOf(
      HttpException,
    );
    prisma.company.findUniqueOrThrow.mockResolvedValue({
      tradeName: 'x',
      email: 'a@b.test',
      emailVerifiedAt: new Date(),
    });
    await expect(service.sendCode('co1', ADMIN)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('si el envío falla no guarda el código y responde 503', async () => {
    mail.send.mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(service.sendCode('co1', ADMIN)).rejects.toThrow(
      'No se pudo enviar el código',
    );
    expect(prisma.emailVerification.create).not.toHaveBeenCalled();
  });

  const pending = (over: object = {}) => ({
    id: 'v1',
    email: 'ventas@rosa.test',
    codeHash: hashCode('co1', '123456'),
    expiresAt: new Date(now + 60_000),
    attempts: 0,
    ...over,
  });

  it('con el código correcto marca el correo verificado y lo audita', async () => {
    prisma.emailVerification.findFirst.mockResolvedValue(pending());
    await expect(service.verify('co1', '123456', ADMIN)).resolves.toMatchObject(
      { verified: true },
    );
    expect(prisma.company.update).toHaveBeenCalledWith({
      where: { id: 'co1' },
      data: { emailVerifiedAt: new Date(now) },
    });
    expect(audit.record).toHaveBeenCalledWith(
      ADMIN,
      expect.objectContaining({ action: 'COMPANY_EMAIL_VERIFIED' }),
      prisma,
    );
  });

  it('código incorrecto suma un intento y dice cuántos quedan', async () => {
    prisma.emailVerification.findFirst.mockResolvedValue(
      pending({ attempts: 1 }),
    );
    const err = (await service
      .verify('co1', '000000', ADMIN)
      .catch((e: BadRequestException) => e)) as BadRequestException;
    expect(JSON.stringify(err.getResponse())).toContain(
      `quedan ${MAX_ATTEMPTS - 2}`,
    );
    expect(prisma.emailVerification.update).toHaveBeenCalledWith({
      where: { id: 'v1' },
      data: { attempts: { increment: 1 } },
    });
    expect(prisma.company.update).not.toHaveBeenCalled();
  });

  it('rechaza código vencido, agotado o enviado a otro correo', async () => {
    for (const p of [
      pending({ expiresAt: new Date(now - 1) }),
      pending({ attempts: MAX_ATTEMPTS }),
      pending({ email: 'correo-anterior@rosa.test' }),
      null,
    ]) {
      prisma.emailVerification.findFirst.mockResolvedValueOnce(p);
      await expect(
        service.verify('co1', '123456', ADMIN),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
    expect(prisma.company.update).not.toHaveBeenCalled();
  });
});
