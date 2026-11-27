import { Module } from '@nestjs/common';
import { SalesController } from './sales.controller';
import { CorrectionsService } from './corrections.service';
import { InvoiceMailerService } from './invoice-mailer.service';
import { SalesService } from './sales.service';

@Module({
  controllers: [SalesController],
  providers: [SalesService, CorrectionsService, InvoiceMailerService],
})
export class SalesModule {}
