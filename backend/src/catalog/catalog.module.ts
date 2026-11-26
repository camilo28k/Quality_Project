import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { InventoryService } from './inventory.service';
import { ReviewService } from './review.service';

@Module({
  controllers: [CatalogController],
  providers: [CatalogService, InventoryService, ReviewService],
})
export class CatalogModule {}
