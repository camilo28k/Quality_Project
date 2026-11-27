import PageContainer, { NoAccess } from '@/components/layout/page-container';
import { CompanyDetail } from '@/features/platform/company-detail';
import { getSessionUser } from '@/lib/session';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Empresa' };

export default async function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const user = (await getSessionUser())!;
  if (user.role !== 'SUPER_ADMIN') return <NoAccess />;
  const { id } = await params;
  return (
    <PageContainer pageTitle='Empresa'>
      <CompanyDetail id={id} />
    </PageContainer>
  );
}
