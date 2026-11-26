import PageContainer from '@/components/layout/page-container';
import { InvoiceView } from '@/features/sales/invoice-view';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Factura' };

/** El backend decide el acceso: otra empresa u otro vendedor reciben 404. */
export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <PageContainer pageTitle='Factura'>
      <InvoiceView id={id} />
    </PageContainer>
  );
}
