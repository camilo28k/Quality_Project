import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash, randomInt } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/decorators';
import { AppLogger } from '../common/logger/app-logger.service';
import { MailService } from '../mail/mail.service';
import { verificationMail } from '../mail/templates';
import { PrismaService } from '../prisma/prisma.service';

export const CODE_TTL_MS = 15 * 60 * 1000;
export const RESEND_COOLDOWN_MS = 60 * 1000;
export const MAX_ATTEMPTS = 5;

/** El código nunca se guarda en claro: se guarda su hash ligado a la empresa. */
export function hashCode(companyId: string, code: string): string {
  return createHash('sha256').update(`${companyId}:${code}`).digest('hex');
}

/**
 * SWR-MAIL-001: el correo de la empresa se verifica con un código de 6 dígitos
 * enviado a ese correo. Hasta verificarlo no se envían facturas a su nombre.
 */
@Injectable()
export class EmailVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
    private readonly logger: AppLogger,
    private readonly now: () => number = Date.now,
  ) {}

  async sendCode(companyId: string, actor: AuthUser) {
    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { tradeName: true, email: true, emailVerifiedAt: true },
    });
    if (!company.email)
      throw new BadRequestException(['La empresa no tiene correo registrado']);
    if (company.emailVerifiedAt)
      throw new ConflictException('El correo de la empresa ya está verificado');
    const last = await this.prisma.emailVerification.findFirst({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    });
    if (last && this.now() - last.createdAt.getTime() < RESEND_COOLDOWN_MS)
      throw new HttpException(
        'Espere un minuto antes de pedir otro código',
        HttpStatus.TOO_MANY_REQUESTS,
      );

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const { subject, html, text } = verificationMail(company.tradeName, code);
    try {
      await this.mail.send({
        fromName: company.tradeName,
        to: company.email,
        subject,
        html,
        text,
      });
    } catch (e) {
      this.logger.warn(
        'EmailVerificationService',
        'COMPANY_EMAIL_CODE_FAILED',
        'No se pudo enviar el código',
        {
          companyId,
          error: (e as Error).message,
        },
      );
      throw new ServiceUnavailableException(
        'No se pudo enviar el código. Intente más tarde.',
      );
    }
    await this.prisma.emailVerification.create({
      data: {
        companyId,
        email: company.email,
        codeHash: hashCode(companyId, code),
        expiresAt: new Date(this.now() + CODE_TTL_MS),
      },
    });
    this.logger.info(
      'EmailVerificationService',
      'COMPANY_EMAIL_CODE_SENT',
      'Código de verificación enviado',
      {
        companyId,
        userId: actor.userId,
      },
    );
    return { sentTo: company.email, expiresInMinutes: CODE_TTL_MS / 60_000 };
  }

  async verify(companyId: string, code: string, actor: AuthUser) {
    const [company, pending] = await Promise.all([
      this.prisma.company.findUniqueOrThrow({
        where: { id: companyId },
        select: { email: true, emailVerifiedAt: true },
      }),
      this.prisma.emailVerification.findFirst({
        where: { companyId, usedAt: null },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    if (company.emailVerifiedAt)
      throw new ConflictException('El correo de la empresa ya está verificado');
    // El código solo vale para el correo al que se envió (si lo cambiaron, no sirve).
    if (!pending || pending.email !== company.email)
      throw new BadRequestException(['Pida un código nuevo']);
    if (pending.expiresAt.getTime() < this.now())
      throw new BadRequestException(['El código venció. Pida uno nuevo']);
    if (pending.attempts >= MAX_ATTEMPTS)
      throw new BadRequestException([
        'Demasiados intentos. Pida un código nuevo',
      ]);

    if (pending.codeHash !== hashCode(companyId, code.trim())) {
      await this.prisma.emailVerification.update({
        where: { id: pending.id },
        data: { attempts: { increment: 1 } },
      });
      this.logger.warn(
        'EmailVerificationService',
        'COMPANY_EMAIL_CODE_REJECTED',
        'Código incorrecto',
        {
          companyId,
          attempts: pending.attempts + 1,
        },
      );
      throw new BadRequestException([
        `Código incorrecto. Le quedan ${MAX_ATTEMPTS - pending.attempts - 1} intento(s)`,
      ]);
    }

    const verifiedAt = new Date(this.now());
    await this.prisma.$transaction(async (tx) => {
      await tx.emailVerification.update({
        where: { id: pending.id },
        data: { usedAt: verifiedAt },
      });
      await tx.company.update({
        where: { id: companyId },
        data: { emailVerifiedAt: verifiedAt },
      });
      await this.audit.record(
        actor,
        {
          companyId,
          action: 'COMPANY_EMAIL_VERIFIED',
          entity: 'Company',
          entityId: companyId,
          after: { email: company.email },
        },
        tx,
      );
    });
    this.logger.info(
      'EmailVerificationService',
      'COMPANY_EMAIL_VERIFIED',
      'Correo de la empresa verificado',
      {
        companyId,
        userId: actor.userId,
      },
    );
    return { verified: true, email: company.email, verifiedAt };
  }
}
