import PageContainer, { NoAccess } from '@/components/layout/page-container';
import { ReviewPanel } from '@/features/review/review-panel';
import { getSessionUser } from '@/lib/session';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Revisión' };

export default async function Page() {
  const user = (await getSessionUser())!;
  if (user.role !== 'ADMIN') return <NoAccess />;
  return (
    <PageContainer pageTitle='Revisión' pageDescription='Productos y precios propuestos por los vendedores.'>
      <ReviewPanel />
    </PageContainer>
  );
}
