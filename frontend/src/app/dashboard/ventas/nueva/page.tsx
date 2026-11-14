import PageContainer from '@/components/layout/page-container';
import { NewSale } from '@/features/sales/new-sale';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Nueva venta' };

export default function NewSalePage() {
  return (
    <PageContainer pageTitle='Nueva venta' pageDescription='Agrega productos, elige el medio de pago y confirma.'>
      <NewSale />
    </PageContainer>
  );
}
