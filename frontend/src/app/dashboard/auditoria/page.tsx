import PageContainer, { NoAccess } from '@/components/layout/page-container';
import { AuditLogView } from '@/features/audit/audit-log';
import { GlobalAudit } from '@/features/audit/global-audit';
import { getSessionUser } from '@/lib/session';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Auditoría' };

export default async function Page() {
  const user = (await getSessionUser())!;
  if (user.role === 'SELLER') return <NoAccess />;
  return (
    <PageContainer
      pageTitle='Auditoría'
      pageDescription={
        user.role === 'SUPER_ADMIN'
          ? 'Acciones de todas las empresas. Este registro no se puede editar ni borrar.'
          : 'Quién hizo qué y cuándo. Este registro no se puede editar ni borrar.'
      }
    >
      {user.role === 'SUPER_ADMIN' ? <GlobalAudit /> : <AuditLogView />}
    </PageContainer>
  );
}
