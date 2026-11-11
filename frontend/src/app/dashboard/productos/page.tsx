import PageContainer from '@/components/layout/page-container';
import { ProductsView } from '@/features/products/products-view';
import { getSessionUser } from '@/lib/session';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Productos' };

export default async function ProductsPage() {
  const user = (await getSessionUser())!;
  return (
    <PageContainer pageTitle='Productos' pageDescription='Catálogo, precios y existencias.'>
      <ProductsView isAdmin={user.role === 'ADMIN'} />
    </PageContainer>
  );
}
