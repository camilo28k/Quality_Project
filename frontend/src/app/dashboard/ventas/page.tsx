import PageContainer from '@/components/layout/page-container';
import { SalesHistory } from '@/features/sales/sales-history';
import { getSessionUser } from '@/lib/session';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Ventas' };

export default async function SalesPage() {
  const user = (await getSessionUser())!;
  return (
    <PageContainer
      pageTitle='Ventas'
      pageDescription={user.role === 'SELLER' ? 'Tus ventas.' : 'Ventas de la empresa, con su factura y su vendedor.'}
    >
      <SalesHistory role={user.role} userId={user.id} />
    </PageContainer>
  );
}
