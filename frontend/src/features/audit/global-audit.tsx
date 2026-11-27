'use client';

import { api } from '@/lib/api';
import { useApiData } from '@/lib/use-api-data';
import { AuditLogView } from './audit-log';

/** SWR-AUD-001: el SUPER_ADMIN ve la auditoría de todas las empresas y puede filtrar por una. */
export function GlobalAudit() {
  const companies = useApiData<{ id: string; tradeName: string }[]>(api('platform/companies'));
  return <AuditLogView companies={companies.data ?? []} />;
}
