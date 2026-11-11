'use client';

import { EmptyState, LoadError, LoadingRows } from '@/components/load-states';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import { formatCOP, formatDateTime, formatQty } from '@/lib/format';
import { PAYMENT_LABEL, UNIT_LABEL, type Sale } from '@/lib/types';
import { useApiData } from '@/lib/use-api-data';

/** Últimas 50 ventas con precio aplicado (SWR-SALE-005) y vendedor. */
export function SalesHistory() {
  const { data, error, loading, reload } = useApiData<Sale[]>(api('sales'));

  if (loading && !data) return <LoadingRows label='Cargando ventas' />;
  if (error) return <LoadError message={error} onRetry={reload} />;
  if (!data?.length) return <EmptyState title='Sin ventas' description='Las ventas confirmadas aparecerán aquí.' />;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Fecha</TableHead>
          <TableHead>Vendedor</TableHead>
          <TableHead>Detalle</TableHead>
          <TableHead>Medio de pago</TableHead>
          <TableHead className='text-right'>Total</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((s) => (
          <TableRow key={s.id}>
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
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
