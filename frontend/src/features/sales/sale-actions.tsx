'use client';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { api, ApiError, apiFetch } from '@/lib/api';
import { formatCOP } from '@/lib/format';
import type { Role } from '@/lib/session-types';
import { PAYMENT_LABEL, UNIT_LABEL, type PaymentMethod, type Sale } from '@/lib/types';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';

type Mode = 'void' | 'reissue' | 'correction' | null;

/**
 * Acciones sobre una venta (SWR-SALE-V01/V02/V03). Una venta nunca se edita:
 * el ADMIN la anula o la reemite; el vendedor pide la corrección de las suyas.
 */
export function SaleActions({
  sale,
  role,
  userId,
  onChanged
}: {
  sale: Sale;
  role: Role;
  userId: string;
  onChanged: () => Promise<void> | void;
}) {
  const [mode, setMode] = useState<Mode>(null);
  const isAdmin = role !== 'SELLER';
  const confirmed = sale.status === 'CONFIRMED';
  const pending = (sale.correctionRequests?.length ?? 0) > 0;

  return (
    <div className='flex flex-wrap justify-end gap-2'>
      <Button variant='outline' size='sm' render={<Link href={`/dashboard/ventas/${sale.id}`} />}>
        Factura
      </Button>
      {isAdmin && confirmed && (
        <>
          <Button variant='outline' size='sm' onClick={() => setMode('reissue')}>
            Reemitir
          </Button>
          <Button variant='destructive' size='sm' onClick={() => setMode('void')}>
            Anular
          </Button>
        </>
      )}
      {!isAdmin && confirmed && sale.userId === userId && !pending && (
        <Button variant='outline' size='sm' onClick={() => setMode('correction')}>
          Pedir corrección
        </Button>
      )}
      <Dialog open={mode !== null} onOpenChange={(open) => !open && setMode(null)}>
        <DialogContent className={mode === 'reissue' ? 'sm:max-w-lg' : 'sm:max-w-md'}>
          {mode === 'void' && (
            <ReasonForm
              title={`Anular la factura ${sale.invoiceNumber}`}
              description={`Se devuelve el stock de ${sale.items.length} línea(s). La venta no se borra: queda visible como anulada.`}
              submitLabel='Anular venta'
              destructive
              onSubmit={async (reason) => {
                await apiFetch(api(`sales/${sale.id}/void`), { method: 'POST', body: { reason } });
                toast.success(`Factura ${sale.invoiceNumber} anulada`);
              }}
              done={async () => (setMode(null), await onChanged())}
            />
          )}
          {mode === 'correction' && (
            <ReasonForm
              title={`Pedir corrección de ${sale.invoiceNumber}`}
              description='El administrador revisará la venta y la anulará o la reemitirá.'
              submitLabel='Enviar solicitud'
              onSubmit={async (reason) => {
                await apiFetch(api(`sales/${sale.id}/correction-requests`), { method: 'POST', body: { reason } });
                toast.success('Solicitud enviada al administrador');
              }}
              done={async () => (setMode(null), await onChanged())}
            />
          )}
          {mode === 'reissue' && <ReissueForm sale={sale} done={async () => (setMode(null), await onChanged())} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ReasonForm({
  title,
  description,
  submitLabel,
  destructive,
  onSubmit,
  done
}: {
  title: string;
  description: string;
  submitLabel: string;
  destructive?: boolean;
  onSubmit: (reason: string) => Promise<void>;
  done: () => Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const reason = String(new FormData(e.currentTarget).get('reason') ?? '').trim();
    if (!reason) return setError('El motivo es obligatorio');
    setSaving(true);
    try {
      await onSubmit(reason);
      await done();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo completar la operación');
      setSaving(false);
    }
  }
  return (
    <form onSubmit={submit} noValidate className='space-y-4'>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <Field>
        <FieldLabel htmlFor='reason'>Motivo</FieldLabel>
        <Input id='reason' name='reason' maxLength={300} autoFocus />
      </Field>
      {error && (
        <p role='alert' className='text-destructive text-sm'>
          {error}
        </p>
      )}
      <div className='flex justify-end gap-2'>
        <Button type='submit' variant={destructive ? 'destructive' : 'default'} disabled={saving}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

/** SWR-SALE-V02: corrige cantidades o medio de pago; la original se anula y la nueva queda enlazada. */
function ReissueForm({ sale, done }: { sale: Sale; done: () => Promise<void> }) {
  const [qty, setQty] = useState<Record<string, string>>(
    Object.fromEntries(sale.items.map((i) => [i.id, String(i.quantity)]))
  );
  const [payment, setPayment] = useState<PaymentMethod>(sale.paymentMethod);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Una clave por intento: si se reintenta tras un error de red no se duplica (SWR-SALE-010).
  const [key] = useState(() => crypto.randomUUID());

  const items = sale.items
    .map((i) => ({ productId: i.productId, quantity: Number(qty[i.id]), unitPrice: i.unitPrice }))
    .filter((i) => i.quantity > 0);
  const newTotal = items.reduce((t, i) => t + Math.round(i.quantity * i.unitPrice), 0);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!reason.trim()) return setError('El motivo es obligatorio');
    if (items.length === 0) return setError('La venta corregida debe tener al menos un producto. Para dejarla en cero, anúlala.');
    if (sale.items.some((i) => !(Number(qty[i.id]) >= 0)))
      return setError('Las cantidades no pueden ser negativas');
    setSaving(true);
    try {
      const res = await apiFetch<{ sale: Sale }>(api(`sales/${sale.id}/reissue`), {
        method: 'POST',
        body: {
          reason: reason.trim(),
          idempotencyKey: key,
          paymentMethod: payment,
          items: items.map(({ productId, quantity }) => ({ productId, quantity })),
          ...(sale.customerEmail ? { customerEmail: sale.customerEmail } : {})
        }
      });
      toast.success(`${sale.invoiceNumber} anulada y reemitida como ${res.sale.invoiceNumber}`);
      await done();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo reemitir la venta');
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className='space-y-4'>
      <DialogHeader>
        <DialogTitle>Reemitir la factura {sale.invoiceNumber}</DialogTitle>
        <DialogDescription>
          La original se anula y se emite una nueva con un consecutivo nuevo, a nombre del mismo vendedor. Los precios son
          los de la venta original.
        </DialogDescription>
      </DialogHeader>
      <div className='space-y-2'>
        {sale.items.map((i) => (
          <div key={i.id} className='grid grid-cols-[1fr_7rem] items-center gap-2'>
            <label htmlFor={`q-${i.id}`} className='text-sm'>
              {i.product?.name} · {formatCOP(i.unitPrice)}/{UNIT_LABEL[i.unit]}
            </label>
            <Input
              id={`q-${i.id}`}
              type='number'
              inputMode='decimal'
              min='0'
              step={i.unit === 'UNIT' ? '1' : '0.001'}
              value={qty[i.id]}
              onChange={(e) => setQty((prev) => ({ ...prev, [i.id]: e.target.value }))}
            />
          </div>
        ))}
      </div>
      <Field>
        <FieldLabel htmlFor='reissue-payment'>Medio de pago</FieldLabel>
        <NativeSelect id='reissue-payment' className='w-full' value={payment} onChange={(e) => setPayment(e.target.value as PaymentMethod)}>
          {(Object.keys(PAYMENT_LABEL) as PaymentMethod[]).map((m) => (
            <NativeSelectOption key={m} value={m}>
              {PAYMENT_LABEL[m]}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      <Field>
        <FieldLabel htmlFor='reissue-reason'>Motivo de la corrección</FieldLabel>
        <Input id='reissue-reason' value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <p className='text-sm' aria-live='polite'>
        Total: {formatCOP(sale.total)} → <strong>{formatCOP(newTotal)}</strong>
      </p>
      {error && (
        <p role='alert' className='text-destructive text-sm'>
          {error}
        </p>
      )}
      <div className='flex justify-end'>
        <Button type='submit' disabled={saving}>
          Anular y reemitir
        </Button>
      </div>
    </form>
  );
}
