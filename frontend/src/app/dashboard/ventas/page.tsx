import PageContainer from '@/components/layout/page-container';
import { SalesHistory } from '@/features/sales/sales-history';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Ventas' };

export default function SalesPage() {
  return (
    <PageContainer pageTitle='Ventas' pageDescription='Últimas ventas confirmadas.'>
      <SalesHistory />
    </PageContainer>
  );
}
