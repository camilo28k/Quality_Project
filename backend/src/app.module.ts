import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { CatalogModule } from './catalog/catalog.module';
import { CompanyModule } from './company/company.module';
import { SalesModule } from './sales/sales.module';
import { LoggerModule } from './common/logger/logger.module';
import { HealthController } from './health.controller';
import { PlatformModule } from './platform/platform.module';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule,
    PrismaModule,
    AuditModule,
    AuthModule,
    CatalogModule,
    SalesModule,
    PlatformModule,
    UsersModule,
    CompanyModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
