import PageContainer, { NoAccess } from '@/components/layout/page-container';
import { SellersManager } from '@/features/users/sellers-manager';
import { getSessionUser } from '@/lib/session';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Vendedores' };

export default async function SellersPage() {
  const user = (await getSessionUser())!;
  if (user.role !== 'ADMIN') return <NoAccess />;
  return (
    <PageContainer pageTitle='Vendedores' pageDescription='Cuentas de quienes venden en tu empresa.'>
      <SellersManager />
    </PageContainer>
  );
}
