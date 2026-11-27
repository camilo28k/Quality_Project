import PageContainer, { NoAccess } from '@/components/layout/page-container';
import { CompaniesManager } from '@/features/platform/companies-manager';
import { getSessionUser } from '@/lib/session';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Empresas' };

export default async function CompaniesPage() {
  const user = (await getSessionUser())!;
  if (user.role !== 'SUPER_ADMIN') return <NoAccess />;
  return (
    <PageContainer pageTitle='Empresas' pageDescription='Emprendimientos de la plataforma y sus administradores.'>
      <CompaniesManager />
    </PageContainer>
  );
}
