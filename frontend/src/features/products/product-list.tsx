'use client';

import { EmptyState } from '@/components/load-states';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCOP, formatQty } from '@/lib/format';
import type { Role } from '@/lib/session-types';
import { UNIT_LABEL, type Product } from '@/lib/types';
import { ProductActions } from './product-actions';

/** Tabla de productos (adaptada de product-tables de la plantilla). */
export function ProductList({
  products,
  role,
  onChanged
}: {
  products: Product[];
  role: Role;
  onChanged: () => Promise<void> | void;
}) {
  if (products.length === 0) {
    return <EmptyState title='Sin productos' description='Aún no hay productos registrados.' />;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Producto</TableHead>
          <TableHead>Categoría</TableHead>
          <TableHead className='text-right'>Precio</TableHead>
          <TableHead className='text-right'>Stock</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead className='sr-only'>Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {products.map((p) => (
          <TableRow key={p.id}>
            <TableCell className='font-medium'>
              {p.name}
              {p.description && <span className='text-muted-foreground block text-xs font-normal'>{p.description}</span>}
            </TableCell>
            <TableCell>{p.category?.name}</TableCell>
            <TableCell className='text-right tabular-nums'>{formatCOP(p.price)}</TableCell>
            <TableCell className='text-right tabular-nums'>
              {formatQty(p.stock)} {UNIT_LABEL[p.unit]}
            </TableCell>
            <TableCell>
              {!p.active ? (
                <Badge variant='outline'>Inactivo</Badge>
              ) : p.approved === false ? (
                <Badge variant='secondary'>Pendiente de aprobación</Badge>
              ) : p.lowStock ? (
                <Badge variant='secondary'>Stock bajo</Badge>
              ) : (
                <Badge>Activo</Badge>
              )}
            </TableCell>
            <TableCell className='text-right'>
              <ProductActions product={p} role={role} onChanged={onChanged} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
