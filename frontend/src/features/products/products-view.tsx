'use client';

import { LoadError, LoadingRows } from '@/components/load-states';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api, ApiError, apiFetch } from '@/lib/api';
import type { Category, Product } from '@/lib/types';
import { useApiData } from '@/lib/use-api-data';
import { toast } from 'sonner';
import { ProductForm } from './product-form';
import { ProductList } from './product-list';

/** SWR-PROD-001 y SWR-PROD-005 (adaptado de product-listing de la plantilla). */
export function ProductsView({ isAdmin }: { isAdmin: boolean }) {
  const products = useApiData<Product[]>(api(`products${isAdmin ? '?includeInactive=true' : ''}`));
  const categories = useApiData<Category[]>(api('categories'));

  async function deactivate(p: Product) {
    try {
      await apiFetch(api(`products/${p.id}/deactivate`), { method: 'PATCH' });
      toast.success(`«${p.name}» desactivado`);
      await products.reload();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'No se pudo desactivar');
    }
  }

  const list =
    products.loading && !products.data ? (
      <LoadingRows label='Cargando productos' />
    ) : products.error ? (
      <LoadError message={products.error} onRetry={products.reload} />
    ) : (
      <ProductList products={products.data ?? []} canManage={isAdmin} onDeactivate={deactivate} />
    );

  if (!isAdmin) return list;

  return (
    <div className='grid gap-4 2xl:grid-cols-[26rem_1fr]'>
      <Card>
        <CardHeader>
          <CardTitle>Nuevo producto</CardTitle>
        </CardHeader>
        <CardContent>
          <ProductForm categories={categories.data ?? []} onCreated={() => void products.reload()} />
        </CardContent>
      </Card>
      <div className='min-w-0'>{list}</div>
    </div>
  );
}
