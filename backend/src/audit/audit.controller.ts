import { Controller, Get, ParseUUIDPipe, Query } from '@nestjs/common';
import { CurrentUser, Roles } from '../auth/decorators';
import type { AuthUser } from '../auth/decorators';
import { AuditService } from './audit.service';

/** SWR-AUD-001: el ADMIN ve la auditoría de su empresa y el SUPER_ADMIN la de todas. */
@Roles('ADMIN', 'SUPER_ADMIN')
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('entity') entity?: string,
    @Query('action') action?: string,
    @Query('cursor') cursor?: string,
    @Query('companyId', new ParseUUIDPipe({ optional: true }))
    companyId?: string,
  ) {
    return this.audit.list({
      // El ADMIN nunca puede pedir otra empresa: se usa siempre la de su sesión.
      companyId: user.role === 'SUPER_ADMIN' ? companyId : user.companyId,
      entity,
      action,
      cursor,
    });
  }
}
