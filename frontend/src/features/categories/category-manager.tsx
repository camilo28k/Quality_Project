'use client';

import { EmptyState, LoadError, LoadingRows } from '@/components/load-states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api, ApiError, apiFetch } from '@/lib/api';
import type { Category } from '@/lib/types';
import { useApiData } from '@/lib/use-api-data';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';

/** SWR-CAT-001 */
export function CategoryManager() {
  const { data, error, loading, reload } = useApiData<Category[]>(api('categories'));
  const [name, setName] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setFieldError('El nombre es obligatorio');
      return;
    }
    setSaving(true);
    setFieldError(null);
    try {
      await apiFetch(api('categories'), { method: 'POST', body: { name: name.trim() } });
      toast.success('Categoría creada');
      setName('');
      await reload();
    } catch (err) {
      setFieldError(err instanceof ApiError ? err.message : 'No se pudo crear la categoría');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className='grid gap-4 lg:grid-cols-[22rem_1fr]'>
      <Card>
        <CardHeader>
          <CardTitle>Nueva categoría</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} noValidate className='space-y-4'>
            <Field data-invalid={!!fieldError}>
              <FieldLabel htmlFor='category-name'>Nombre</FieldLabel>
              <Input
                id='category-name'
                value={name}
                maxLength={60}
                onChange={(e) => setName(e.target.value)}
                aria-invalid={!!fieldError}
              />
              {fieldError && <FieldError>{fieldError}</FieldError>}
            </Field>
            <Button type='submit' disabled={saving}>
              Guardar categoría
            </Button>
          </form>
        </CardContent>
      </Card>
      <div>
        {loading && !data ? (
          <LoadingRows label='Cargando categorías' />
        ) : error ? (
          <LoadError message={error} onRetry={reload} />
        ) : !data?.length ? (
          <EmptyState title='Sin categorías' description='Crea la primera categoría para registrar productos.' />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Categoría</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>{c.name}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
