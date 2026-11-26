'use client';

import { EmptyState, LoadError, LoadingRows } from '@/components/load-states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api, ApiError, apiFetch } from '@/lib/api';
import { formatCOP, formatDateTime } from '@/lib/format';
import type { Product } from '@/lib/types';
import { useApiData } from '@/lib/use-api-data';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';

interface Correction {
  id: string;
  reason: string;
  requestedByName: string | null;
  sale: { id: string; invoiceNumber: string; total: number };
}

interface Review {
  pendingProducts: (Product & { createdByName: string | null })[];
  priceRequests: {
    id: string;
    currentPrice: number;
    proposedPrice: number;
    reason: string | null;
    createdAt: string;
    requestedByName: string | null;
    product: { id: string; name: string };
  }[];
  recentPriceChanges: {
    id: string;
    productName: string;
    before: { price?: number } | null;
    after: { price?: number } | null;
    userName: string | null;
    createdAt: string;
  }[];
}

/** Panel de revisión del ADMIN (decisión a): productos y precios propuestos por vendedores. */
export function ReviewPanel() {
  const { data, error, loading, reload } = useApiData<Review>(api('review'));
  const corrections = useApiData<Correction[]>(api('correction-requests'));

  async function run(path: string, ok: string, body: unknown = {}) {
    try {
      await apiFetch(api(path), { method: 'POST', body });
      toast.success(ok);
      await Promise.all([reload(), corrections.reload()]);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'No se pudo completar la operación');
    }
  }

  if (loading && !data) return <LoadingRows label='Cargando revisión' />;
  if (error) return <LoadError message={error} onRetry={reload} />;
  if (!data) return null;

  return (
    <div className='space-y-4'>
      <Card>
        <CardHeader>
          <CardTitle>
            Correcciones de ventas pedidas <Badge variant='secondary'>{corrections.data?.length ?? 0}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className='overflow-x-auto'>
          {!corrections.data?.length ? (
            <EmptyState
              title='Sin correcciones'
              description='Cuando un vendedor pida corregir una venta aparecerá aquí. Se resuelve anulando o reemitiendo en Ventas.'
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Factura</TableHead>
                  <TableHead>Vendedor</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead className='sr-only'>Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {corrections.data.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className='font-medium'>
                      {c.sale.invoiceNumber}
                      <span className='text-muted-foreground block text-xs'>{formatCOP(c.sale.total)}</span>
                    </TableCell>
                    <TableCell>{c.requestedByName}</TableCell>
                    <TableCell>{c.reason}</TableCell>
                    <TableCell className='space-x-2 text-right whitespace-nowrap'>
                      <Button size='sm' render={<Link href={`/dashboard/ventas/${c.sale.id}`} />}>
                        Ver venta
                      </Button>
                      <Button
                        size='sm'
                        variant='outline'
                        onClick={() => run(`correction-requests/${c.id}/reject`, 'Corrección rechazada')}
                      >
                        Rechazar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Productos de vendedores por aprobar <Badge variant='secondary'>{data.pendingProducts.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className='overflow-x-auto'>
          {data.pendingProducts.length === 0 ? (
            <EmptyState title='Nada pendiente' description='Los productos que creen los vendedores aparecerán aquí.' />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead>Creado por</TableHead>
                  <TableHead className='text-right'>Precio sugerido</TableHead>
                  <TableHead className='sr-only'>Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.pendingProducts.map((p) => (
                  <PendingProductRow key={p.id} product={p} onApprove={(price) => run(`products/${p.id}/approve`, `«${p.name}» aprobado`, { price })} />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Solicitudes de cambio de precio <Badge variant='secondary'>{data.priceRequests.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className='overflow-x-auto'>
          {data.priceRequests.length === 0 ? (
            <EmptyState title='Sin solicitudes' description='Cuando un vendedor proponga un precio aparecerá aquí.' />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead>Vendedor</TableHead>
                  <TableHead className='text-right'>Actual → propuesto</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead className='sr-only'>Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.priceRequests.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className='font-medium'>{r.product.name}</TableCell>
                    <TableCell>{r.requestedByName}</TableCell>
                    <TableCell className='text-right tabular-nums'>
                      {formatCOP(r.currentPrice)} → <strong>{formatCOP(r.proposedPrice)}</strong>
                    </TableCell>
                    <TableCell>{r.reason ?? '—'}</TableCell>
                    <TableCell className='space-x-2 text-right whitespace-nowrap'>
                      <Button size='sm' onClick={() => run(`price-requests/${r.id}/approve`, 'Precio aprobado')}>
                        Aprobar
                      </Button>
                      <Button size='sm' variant='outline' onClick={() => run(`price-requests/${r.id}/reject`, 'Solicitud rechazada')}>
                        Rechazar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cambios de precio de los últimos 30 días</CardTitle>
        </CardHeader>
        <CardContent className='overflow-x-auto'>
          {data.recentPriceChanges.length === 0 ? (
            <EmptyState title='Sin cambios' description='No hubo cambios de precio recientes.' />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead className='text-right'>Antes → después</TableHead>
                  <TableHead>Quién</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recentPriceChanges.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>{formatDateTime(c.createdAt)}</TableCell>
                    <TableCell>{c.productName}</TableCell>
                    <TableCell className='text-right tabular-nums'>
                      {c.before?.price !== undefined ? formatCOP(c.before.price) : '—'} →{' '}
                      {c.after?.price !== undefined ? formatCOP(c.after.price) : '—'}
                    </TableCell>
                    <TableCell>{c.userName}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PendingProductRow({
  product: p,
  onApprove
}: {
  product: Review['pendingProducts'][number];
  onApprove: (price: number) => void;
}) {
  const [price, setPrice] = useState(String(p.price));
  const valid = /^\d+$/.test(price);
  return (
    <TableRow>
      <TableCell className='font-medium'>
        {p.name}
        <span className='text-muted-foreground block text-xs'>{p.category?.name}</span>
      </TableCell>
      <TableCell>{p.createdByName}</TableCell>
      <TableCell className='text-right'>
        <Input
          aria-label={`Precio final de ${p.name}`}
          className='ml-auto w-32 text-right'
          inputMode='numeric'
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
      </TableCell>
      <TableCell className='text-right'>
        <Button size='sm' disabled={!valid} onClick={() => onApprove(Number(price))}>
          Aprobar
        </Button>
      </TableCell>
    </TableRow>
  );
}
