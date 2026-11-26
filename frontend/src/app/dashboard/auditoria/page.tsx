import PageContainer, { NoAccess } from '@/components/layout/page-container';
import { AuditLogView } from '@/features/audit/audit-log';
import { getSessionUser } from '@/lib/session';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Auditoría' };

export default async function Page() {
  const user = (await getSessionUser())!;
  if (user.role !== 'ADMIN') return <NoAccess />;
  return (
    <PageContainer pageTitle='Auditoría' pageDescription='Quién hizo qué y cuándo. Este registro no se puede editar ni borrar.'>
      <AuditLogView />
    </PageContainer>
  );
}
