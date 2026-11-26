'use client';

import { LoadError, LoadingRows } from '@/components/load-states';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import type { Role } from '@/lib/session-types';
import type { Category, Product } from '@/lib/types';
import { useApiData } from '@/lib/use-api-data';
import { ProductForm } from './product-form';
import { ProductList } from './product-list';

/**
 * SWR-PROD-001/005 y SWR-ROLE-003: el ADMIN y el vendedor registran productos
 * (los del vendedor quedan pendientes de aprobación); las acciones dependen del rol.
 */
export function ProductsView({ role }: { role: Role }) {
  const isAdmin = role !== 'SELLER';
  const products = useApiData<Product[]>(api(`products${isAdmin ? '?includeInactive=true' : ''}`));
  const categories = useApiData<Category[]>(api('categories'));

  const list =
    products.loading && !products.data ? (
      <LoadingRows label='Cargando productos' />
    ) : products.error ? (
      <LoadError message={products.error} onRetry={products.reload} />
    ) : (
      <ProductList products={products.data ?? []} role={role} onChanged={products.reload} />
    );

  return (
    <div className='grid gap-4 2xl:grid-cols-[26rem_1fr]'>
      <Card>
        <CardHeader>
          <CardTitle>Nuevo producto</CardTitle>
        </CardHeader>
        <CardContent className='space-y-4'>
          {!isAdmin && (
            <Alert>
              <AlertDescription>
                El producto quedará pendiente hasta que el administrador lo apruebe y confirme el precio.
              </AlertDescription>
            </Alert>
          )}
          <ProductForm categories={categories.data ?? []} onCreated={() => void products.reload()} />
        </CardContent>
      </Card>
      <div className='min-w-0 overflow-x-auto'>{list}</div>
    </div>
  );
}
