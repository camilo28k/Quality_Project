import PageContainer, { NoAccess } from '@/components/layout/page-container';
import { CompanySettings } from '@/features/company/company-settings';
import { getSessionUser } from '@/lib/session';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Configuración de la empresa' };

export default async function CompanySettingsPage() {
  const user = (await getSessionUser())!;
  if (user.role !== 'ADMIN') return <NoAccess />;
  return (
    <PageContainer pageTitle='Configuración de la empresa' pageDescription='Datos que aparecen en tus facturas.'>
      <CompanySettings />
    </PageContainer>
  );
}
