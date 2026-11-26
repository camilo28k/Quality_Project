'use client';

import { LoadError, LoadingRows } from '@/components/load-states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { formatCOP, formatDateTime, formatQty } from '@/lib/format';
import { PAYMENT_LABEL, UNIT_LABEL, type Sale } from '@/lib/types';
import { useApiData } from '@/lib/use-api-data';
import Link from 'next/link';

interface Invoice {
  sale: Sale;
  company: {
    tradeName: string;
    legalName: string | null;
    taxId: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
    city: string | null;
    logoUrl: string | null;
    invoiceFooter: string | null;
  };
}

/** SWR-INV-002: factura con datos de la empresa, consecutivo, vendedor, detalle y total. */
export function InvoiceView({ id }: { id: string }) {
  const { data, error, loading, reload } = useApiData<Invoice>(api(`sales/${id}/invoice`));
  if (loading && !data) return <LoadingRows label='Cargando factura' />;
  if (error) return <LoadError message={error} onRetry={reload} />;
  if (!data) return null;
  const { sale, company: c } = data;
  const voided = sale.status === 'VOIDED';

  return (
    <div className='space-y-4'>
      <div className='flex gap-2 print:hidden'>
        <Button variant='outline' render={<Link href='/dashboard/ventas' />}>
          Volver
        </Button>
        <Button onClick={() => window.print()}>Imprimir</Button>
      </div>
      <article
        aria-label={`Factura ${sale.invoiceNumber}`}
        className='bg-card relative mx-auto max-w-2xl space-y-6 rounded-xl border p-6 print:border-0 print:p-0'
      >
        {voided && (
          <div role='status' className='border-destructive text-destructive rounded-md border-2 p-3 text-center font-semibold'>
            FACTURA ANULADA{sale.voidReason ? ` · ${sale.voidReason}` : ''}
            {sale.reissuedAs && <span className='block text-sm font-normal'>Reemplazada por {sale.reissuedAs.invoiceNumber}</span>}
          </div>
        )}
        <header className='flex flex-wrap items-start justify-between gap-4'>
          <div className='space-y-1'>
            {c.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={c.logoUrl} alt={`Logo de ${c.tradeName}`} className='mb-2 h-12 w-auto' />
            )}
            <h2 className='text-xl font-semibold'>{c.tradeName}</h2>
            {c.legalName && <p className='text-sm'>{c.legalName}</p>}
            {c.taxId && <p className='text-sm'>NIT {c.taxId}</p>}
            <p className='text-muted-foreground text-sm'>
              {[c.address, c.city].filter(Boolean).join(', ')}
              {c.phone ? ` · ${c.phone}` : ''}
            </p>
            {c.email && <p className='text-muted-foreground text-sm'>{c.email}</p>}
          </div>
          <div className='text-right'>
            <p className='text-muted-foreground text-xs uppercase'>Factura</p>
            <p className='text-2xl font-bold tabular-nums'>{sale.invoiceNumber}</p>
            <p className='text-sm'>{formatDateTime(sale.createdAt)}</p>
            {sale.correctsSale && <Badge variant='secondary'>Corrige {sale.correctsSale.invoiceNumber}</Badge>}
          </div>
        </header>
        <dl className='grid grid-cols-2 gap-2 text-sm'>
          <dt className='text-muted-foreground'>Vendedor</dt>
          <dd>{sale.user?.name}</dd>
          <dt className='text-muted-foreground'>Medio de pago</dt>
          <dd>{PAYMENT_LABEL[sale.paymentMethod]}</dd>
          {sale.customerEmail && (
            <>
              <dt className='text-muted-foreground'>Cliente</dt>
              <dd>{sale.customerEmail}</dd>
            </>
          )}
        </dl>
        <table className='w-full text-sm'>
          <thead>
            <tr className='border-b text-left'>
              <th className='py-2'>Producto</th>
              <th className='py-2 text-right'>Cantidad</th>
              <th className='py-2 text-right'>Precio</th>
              <th className='py-2 text-right'>Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {sale.items.map((i) => (
              <tr key={i.id} className='border-b'>
                <td className='py-2'>{i.product?.name}</td>
                <td className='py-2 text-right tabular-nums'>
                  {formatQty(i.quantity)} {UNIT_LABEL[i.unit]}
                </td>
                <td className='py-2 text-right tabular-nums'>{formatCOP(i.unitPrice)}</td>
                <td className='py-2 text-right tabular-nums'>{formatCOP(i.subtotal)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} className='py-3 text-right font-semibold'>
                Total
              </td>
              <td className='py-3 text-right text-lg font-bold tabular-nums'>{formatCOP(sale.total)}</td>
            </tr>
          </tfoot>
        </table>
        {c.invoiceFooter && <p className='text-muted-foreground text-center text-xs'>{c.invoiceFooter}</p>}
      </article>
    </div>
  );
}
