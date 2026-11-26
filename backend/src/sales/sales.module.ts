import { Module } from '@nestjs/common';
import { SalesController } from './sales.controller';
import { CorrectionsService } from './corrections.service';
import { SalesService } from './sales.service';

@Module({
  controllers: [SalesController],
  providers: [SalesService, CorrectionsService],
})
export class SalesModule {}
