import { AuditService } from '../audit/audit.service';
import { AppLogger } from '../common/logger/app-logger.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { Module } from '@nestjs/common';
import { CompanyController } from './company.controller';
import { CompanyService } from './company.service';
import { EmailVerificationService } from './email-verification.service';

@Module({
  controllers: [CompanyController],
  providers: [
    CompanyService,
    {
      provide: EmailVerificationService,
      inject: [PrismaService, MailService, AuditService, AppLogger],
      useFactory: (
        p: PrismaService,
        m: MailService,
        a: AuditService,
        l: AppLogger,
      ) => new EmailVerificationService(p, m, a, l),
    },
  ],
})
export class CompanyModule {}
