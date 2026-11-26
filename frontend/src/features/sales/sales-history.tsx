'use client';

import { EmptyState, LoadError, LoadingRows } from '@/components/load-states';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import { formatCOP, formatDateTime, formatQty } from '@/lib/format';
import { PAYMENT_LABEL, UNIT_LABEL, type Sale } from '@/lib/types';
import type { Role } from '@/lib/session-types';
import { useApiData } from '@/lib/use-api-data';
import { SaleActions } from './sale-actions';

/** Últimas 50 ventas con factura, estado, precio aplicado (SWR-SALE-005) y vendedor. */
export function SalesHistory({ role, userId }: { role: Role; userId: string }) {
  const { data, error, loading, reload } = useApiData<Sale[]>(api('sales'));

  if (loading && !data) return <LoadingRows label='Cargando ventas' />;
  if (error) return <LoadError message={error} onRetry={reload} />;
  if (!data?.length) return <EmptyState title='Sin ventas' description='Las ventas confirmadas aparecerán aquí.' />;

  return (
    <div className='min-w-0 overflow-x-auto'>
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Factura</TableHead>
          <TableHead>Fecha</TableHead>
          <TableHead>Vendedor</TableHead>
          <TableHead>Detalle</TableHead>
          <TableHead>Medio de pago</TableHead>
          <TableHead className='text-right'>Total</TableHead>
          <TableHead className='sr-only'>Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((s) => (
          <TableRow key={s.id} className={s.status === 'VOIDED' ? 'text-muted-foreground' : undefined}>
            <TableCell className='font-medium whitespace-nowrap'>
              <span className={s.status === 'VOIDED' ? 'line-through' : undefined}>{s.invoiceNumber}</span>
              {s.status === 'VOIDED' && (
                <Badge variant='destructive' className='ml-2'>
                  Anulada
                </Badge>
              )}
              {s.reissuedAs && (
                <span className='block text-xs font-normal'>Reemitida como {s.reissuedAs.invoiceNumber}</span>
              )}
              {s.correctsSale && <span className='block text-xs font-normal'>Corrige {s.correctsSale.invoiceNumber}</span>}
              {(s.correctionRequests?.length ?? 0) > 0 && (
                <Badge variant='secondary' className='mt-1'>
                  Corrección pedida
                </Badge>
              )}
            </TableCell>
            <TableCell className='whitespace-nowrap'>{formatDateTime(s.createdAt)}</TableCell>
            <TableCell>{s.user?.name}</TableCell>
            <TableCell>
              <ul className='text-sm'>
                {s.items.map((i) => (
                  <li key={i.id}>
                    {i.product?.name}: {formatQty(i.quantity)} {UNIT_LABEL[i.unit]} × {formatCOP(i.unitPrice)}
                  </li>
                ))}
              </ul>
            </TableCell>
            <TableCell>
              <Badge variant='outline'>{PAYMENT_LABEL[s.paymentMethod]}</Badge>
            </TableCell>
            <TableCell className='text-right font-medium tabular-nums'>{formatCOP(s.total)}</TableCell>
            <TableCell>
              <SaleActions sale={s} role={role} userId={userId} onChanged={reload} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
    </div>
  );
}
