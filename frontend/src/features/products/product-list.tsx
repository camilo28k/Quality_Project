'use client';

import { EmptyState } from '@/components/load-states';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCOP, formatQty } from '@/lib/format';
import { UNIT_LABEL, type Product } from '@/lib/types';

/** Tabla de productos (adaptada de product-tables de la plantilla). */
export function ProductList({
  products,
  canManage,
  onDeactivate
}: {
  products: Product[];
  canManage: boolean;
  onDeactivate: (p: Product) => void;
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
          {canManage && <TableHead className='sr-only'>Acciones</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {products.map((p) => (
          <TableRow key={p.id}>
            <TableCell className='font-medium'>{p.name}</TableCell>
            <TableCell>{p.category?.name}</TableCell>
            <TableCell className='text-right tabular-nums'>{formatCOP(p.price)}</TableCell>
            <TableCell className='text-right tabular-nums'>
              {formatQty(p.stock)} {UNIT_LABEL[p.unit]}
            </TableCell>
            <TableCell>
              {!p.active ? (
                <Badge variant='outline'>Inactivo</Badge>
              ) : p.lowStock ? (
                <Badge variant='secondary'>Stock bajo</Badge>
              ) : (
                <Badge>Activo</Badge>
              )}
            </TableCell>
            {canManage && (
              <TableCell className='text-right'>
                {p.active && (
                  <AlertDialog>
                    <AlertDialogTrigger render={<Button variant='destructive' size='sm' />}>
                      Desactivar
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>¿Desactivar «{p.name}»?</AlertDialogTitle>
                        <AlertDialogDescription>
                          No aparecerá en nuevas ventas. Sus ventas y movimientos se conservan.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction variant='destructive' onClick={() => onDeactivate(p)}>
                          Desactivar
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
