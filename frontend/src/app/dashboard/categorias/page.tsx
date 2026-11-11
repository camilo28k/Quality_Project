import PageContainer, { NoAccess } from '@/components/layout/page-container';
import { CategoryManager } from '@/features/categories/category-manager';
import { getSessionUser } from '@/lib/session';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Categorías' };

export default async function CategoriesPage() {
  const user = (await getSessionUser())!;
  if (user.role !== 'ADMIN') return <NoAccess />;
  return (
    <PageContainer pageTitle='Categorías' pageDescription='Clasificación de los productos.'>
      <CategoryManager />
    </PageContainer>
  );
}
