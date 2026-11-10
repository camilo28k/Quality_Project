import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { CatalogModule } from './catalog/catalog.module';
import { SalesModule } from './sales/sales.module';
import { LoggerModule } from './common/logger/logger.module';
import { HealthController } from './health.controller';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule,
    PrismaModule,
    AuthModule,
    CatalogModule,
    SalesModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
