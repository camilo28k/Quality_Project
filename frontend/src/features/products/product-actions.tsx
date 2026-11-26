'use client';

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
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { api, ApiError, apiFetch } from '@/lib/api';
import { formatCOP } from '@/lib/format';
import type { Role } from '@/lib/session-types';
import { UNIT_LABEL, type Product } from '@/lib/types';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';

type Mode = 'edit' | 'stock' | 'price' | null;

const message = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

/**
 * Acciones por producto según el rol (SWR-ROLE-003, SWR-STK-001, SWR-CAT-D01):
 * ADMIN edita todo, mueve stock, desactiva/activa y elimina; el vendedor edita
 * nombre y descripción, registra entradas y propone precios.
 */
export function ProductActions({
  product,
  role,
  onChanged
}: {
  product: Product;
  role: Role;
  onChanged: () => Promise<void> | void;
}) {
  const [mode, setMode] = useState<Mode>(null);
  const isAdmin = role !== 'SELLER';

  async function run(path: string, method: string, ok: string, body?: unknown) {
    try {
      await apiFetch(api(path), { method, body });
      toast.success(ok);
      await onChanged();
      return true;
    } catch (e) {
      toast.error(message(e, 'No se pudo completar la operación'));
      return false;
    }
  }

  return (
    <div className='flex flex-wrap justify-end gap-2'>
      <Button variant='outline' size='sm' onClick={() => setMode('edit')}>
        Editar
      </Button>
      {product.active && (
        <Button variant='outline' size='sm' onClick={() => setMode('stock')}>
          Stock
        </Button>
      )}
      {!isAdmin && product.approved !== false && (
        <Button variant='outline' size='sm' onClick={() => setMode('price')}>
          Proponer precio
        </Button>
      )}
      {isAdmin &&
        (product.active ? (
          <AlertDialog>
            <AlertDialogTrigger render={<Button variant='destructive' size='sm' />}>Desactivar</AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Desactivar «{product.name}»?</AlertDialogTitle>
                <AlertDialogDescription>
                  No aparecerá en nuevas ventas. Sus ventas y movimientos se conservan. Puedes reactivarlo cuando quieras.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  variant='destructive'
                  onClick={() => run(`products/${product.id}/deactivate`, 'PATCH', `«${product.name}» desactivado`)}
                >
                  Desactivar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : (
          <Button size='sm' onClick={() => run(`products/${product.id}/activate`, 'PATCH', `«${product.name}» reactivado`)}>
            Activar
          </Button>
        ))}
      {isAdmin && (
        <AlertDialog>
          <AlertDialogTrigger render={<Button variant='ghost' size='sm' className='text-destructive' />}>
            Eliminar
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Eliminar «{product.name}» definitivamente?</AlertDialogTitle>
              <AlertDialogDescription>
                Solo se puede eliminar si nunca se vendió. Se borran también sus movimientos de stock; la auditoría conserva
                el registro. Si ya tiene ventas, desactívalo en su lugar.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                variant='destructive'
                onClick={() => run(`products/${product.id}`, 'DELETE', `«${product.name}» eliminado`)}
              >
                Eliminar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      <Dialog open={mode !== null} onOpenChange={(open) => !open && setMode(null)}>
        <DialogContent className='sm:max-w-md'>
          {mode === 'edit' && <EditForm product={product} isAdmin={isAdmin} run={run} close={() => setMode(null)} />}
          {mode === 'stock' && <StockForm product={product} isAdmin={isAdmin} run={run} close={() => setMode(null)} />}
          {mode === 'price' && <PriceForm product={product} run={run} close={() => setMode(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

type Run = (path: string, method: string, ok: string, body?: unknown) => Promise<boolean>;

function NumberField({ id, label, error, defaultValue, step = '1' }: { id: string; label: string; error?: string; defaultValue?: number; step?: string }) {
  return (
    <Field data-invalid={!!error}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input id={id} name={id} type='number' inputMode='decimal' min='0' step={step} defaultValue={defaultValue} aria-invalid={!!error} />
      {error && <FieldError>{error}</FieldError>}
    </Field>
  );
}

function EditForm({ product, isAdmin, run, close }: { product: Product; isAdmin: boolean; run: Run; close: () => void }) {
  const [error, setError] = useState<string | null>(null);
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    if (!f.name?.trim()) return setError('El nombre es obligatorio');
    const body: Record<string, unknown> = { name: f.name.trim(), description: f.description?.trim() ?? '' };
    if (isAdmin) {
      for (const k of ['cost', 'price'] as const) {
        const n = Number(f[k]);
        if (!Number.isInteger(n) || n < 0) return setError('Costo y precio deben ser enteros en pesos, sin negativos');
        body[k] = n;
      }
      const min = Number(f.minStock);
      if (!(min >= 0)) return setError('El stock mínimo no puede ser negativo');
      body.minStock = min;
    }
    // Solo se envía lo que cambió.
    const changed = Object.fromEntries(
      Object.entries(body).filter(([k, v]) => v !== ((product as unknown as Record<string, unknown>)[k] ?? ''))
    );
    if (Object.keys(changed).length === 0) return close();
    if (await run(`products/${product.id}`, 'PATCH', 'Producto actualizado', changed)) close();
  }
  return (
    <form onSubmit={onSubmit} noValidate className='space-y-4'>
      <DialogHeader>
        <DialogTitle>Editar «{product.name}»</DialogTitle>
        {!isAdmin && <DialogDescription>Para cambiar el precio usa «Proponer precio».</DialogDescription>}
      </DialogHeader>
      <Field>
        <FieldLabel htmlFor='name'>Nombre</FieldLabel>
        <Input id='name' name='name' defaultValue={product.name} maxLength={120} />
      </Field>
      <Field>
        <FieldLabel htmlFor='description'>Descripción</FieldLabel>
        <Input id='description' name='description' defaultValue={product.description ?? ''} maxLength={500} />
      </Field>
      {isAdmin && (
        <div className='grid grid-cols-3 gap-3'>
          <NumberField id='cost' label='Costo' defaultValue={product.cost} />
          <NumberField id='price' label='Precio' defaultValue={product.price} />
          <NumberField id='minStock' label='Stock mín.' defaultValue={product.minStock} step='0.001' />
        </div>
      )}
      {error && (
        <p role='alert' className='text-destructive text-sm'>
          {error}
        </p>
      )}
      <div className='flex justify-end gap-2'>
        <Button type='button' variant='ghost' onClick={close}>
          Cancelar
        </Button>
        <Button type='submit'>Guardar</Button>
      </div>
    </form>
  );
}

function StockForm({ product, isAdmin, run, close }: { product: Product; isAdmin: boolean; run: Run; close: () => void }) {
  const [error, setError] = useState<string | null>(null);
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const quantity = Number(f.quantity);
    if (!(quantity > 0)) return setError('La cantidad debe ser mayor que cero');
    if (product.unit === 'UNIT' && !Number.isInteger(quantity))
      return setError('Los productos por unidad solo admiten cantidades enteras');
    if (!f.reason?.trim()) return setError('El motivo es obligatorio');
    const out = f.type === 'out';
    const ok = await run(
      `products/${product.id}/${out ? 'stock-adjustments' : 'stock-entries'}`,
      'POST',
      out ? 'Baja de stock registrada' : 'Entrada de stock registrada',
      { quantity, reason: f.reason.trim() }
    );
    if (ok) close();
  }
  return (
    <form onSubmit={onSubmit} noValidate className='space-y-4'>
      <DialogHeader>
        <DialogTitle>Stock de «{product.name}»</DialogTitle>
        <DialogDescription>
          Actual: {product.stock} {UNIT_LABEL[product.unit]}. Cada movimiento queda registrado con tu nombre y el motivo.
        </DialogDescription>
      </DialogHeader>
      <Field>
        <FieldLabel htmlFor='type'>Tipo de movimiento</FieldLabel>
        <NativeSelect id='type' name='type' defaultValue='in' className='w-full'>
          <NativeSelectOption value='in'>Entrada (llegó mercancía)</NativeSelectOption>
          {isAdmin && <NativeSelectOption value='out'>Baja (pérdida o daño)</NativeSelectOption>}
        </NativeSelect>
      </Field>
      <NumberField id='quantity' label={`Cantidad (${UNIT_LABEL[product.unit]})`} step={product.unit === 'UNIT' ? '1' : '0.001'} />
      <Field>
        <FieldLabel htmlFor='reason'>Motivo</FieldLabel>
        <Input id='reason' name='reason' maxLength={200} placeholder='Ej.: compra al proveedor' />
      </Field>
      {error && (
        <p role='alert' className='text-destructive text-sm'>
          {error}
        </p>
      )}
      <div className='flex justify-end gap-2'>
        <Button type='button' variant='ghost' onClick={close}>
          Cancelar
        </Button>
        <Button type='submit'>Registrar</Button>
      </div>
    </form>
  );
}

function PriceForm({ product, run, close }: { product: Product; run: Run; close: () => void }) {
  const [error, setError] = useState<string | null>(null);
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const proposedPrice = Number(f.proposedPrice);
    if (!Number.isInteger(proposedPrice) || proposedPrice < 0) return setError('El precio debe ser un entero en pesos');
    if (proposedPrice === product.price) return setError('El precio propuesto es igual al actual');
    const ok = await run(`products/${product.id}/price-requests`, 'POST', 'Solicitud enviada al administrador', {
      proposedPrice,
      reason: f.reason?.trim() || undefined
    });
    if (ok) close();
  }
  return (
    <form onSubmit={onSubmit} noValidate className='space-y-4'>
      <DialogHeader>
        <DialogTitle>Proponer precio</DialogTitle>
        <DialogDescription>
          «{product.name}» cuesta hoy {formatCOP(product.price)}. El administrador aprobará o rechazará el cambio.
        </DialogDescription>
      </DialogHeader>
      <NumberField id='proposedPrice' label='Precio propuesto (COP)' />
      <Field>
        <FieldLabel htmlFor='reason'>Motivo (opcional)</FieldLabel>
        <Input id='reason' name='reason' maxLength={200} />
      </Field>
      {error && (
        <p role='alert' className='text-destructive text-sm'>
          {error}
        </p>
      )}
      <div className='flex justify-end gap-2'>
        <Button type='button' variant='ghost' onClick={close}>
          Cancelar
        </Button>
        <Button type='submit'>Enviar solicitud</Button>
      </div>
    </form>
  );
}
