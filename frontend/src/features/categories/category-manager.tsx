'use client';

import { EmptyState, LoadError, LoadingRows } from '@/components/load-states';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api, ApiError, apiFetch } from '@/lib/api';
import type { Category } from '@/lib/types';
import { useApiData } from '@/lib/use-api-data';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';

/** SWR-CAT-001 y SWR-CAT-D01: solo el ADMIN crea, renombra, desactiva y elimina categorías. */
export function CategoryManager() {
  const { data, error, loading, reload } = useApiData<Category[]>(api('categories?includeInactive=true'));
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
      <div className='min-w-0 overflow-x-auto'>
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
                <TableHead className='text-right'>Productos</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className='sr-only'>Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((c) => (
                <CategoryRow key={c.id} category={c} onChanged={reload} />
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}

function CategoryRow({ category: c, onChanged }: { category: Category; onChanged: () => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(c.name);
  const [error, setError] = useState<string | null>(null);
  const products = c._count?.products ?? 0;

  async function run(path: string, method: string, ok: string, body?: unknown) {
    try {
      await apiFetch(api(path), { method, body });
      toast.success(ok);
      await onChanged();
      return true;
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'No se pudo completar la operación';
      setError(msg);
      toast.error(msg);
      return false;
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError('El nombre es obligatorio');
    if (name.trim() === c.name) return setEditing(false);
    if (await run(`categories/${c.id}`, 'PATCH', 'Categoría renombrada', { name: name.trim() })) setEditing(false);
  }

  return (
    <TableRow>
      <TableCell>
        {editing ? (
          <form onSubmit={save} className='flex items-center gap-2'>
            <Input
              aria-label={`Nuevo nombre de ${c.name}`}
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
            <Button type='submit' size='sm'>
              Guardar
            </Button>
            <Button type='button' size='sm' variant='ghost' onClick={() => (setEditing(false), setName(c.name))}>
              Cancelar
            </Button>
          </form>
        ) : (
          c.name
        )}
        {error && editing && <p className='text-destructive text-xs'>{error}</p>}
      </TableCell>
      <TableCell className='text-right tabular-nums'>{products}</TableCell>
      <TableCell>{c.active === false ? <Badge variant='outline'>Inactiva</Badge> : <Badge>Activa</Badge>}</TableCell>
      <TableCell className='space-x-2 text-right whitespace-nowrap'>
        {!editing && (
          <Button size='sm' variant='outline' onClick={() => setEditing(true)}>
            Renombrar
          </Button>
        )}
        {c.active === false ? (
          <Button size='sm' onClick={() => run(`categories/${c.id}/activate`, 'PATCH', `«${c.name}» activada`)}>
            Activar
          </Button>
        ) : (
          <Button size='sm' variant='outline' onClick={() => run(`categories/${c.id}/deactivate`, 'PATCH', `«${c.name}» desactivada`)}>
            Desactivar
          </Button>
        )}
        <AlertDialog>
          <AlertDialogTrigger
            render={<Button size='sm' variant='ghost' className='text-destructive' disabled={products > 0} />}
            title={products > 0 ? 'Tiene productos: desactívala en lugar de eliminarla' : undefined}
          >
            Eliminar
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Eliminar la categoría «{c.name}»?</AlertDialogTitle>
              <AlertDialogDescription>No tiene productos. La eliminación queda registrada en la auditoría.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction variant='destructive' onClick={() => run(`categories/${c.id}`, 'DELETE', `«${c.name}» eliminada`)}>
                Eliminar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </TableCell>
    </TableRow>
  );
}
