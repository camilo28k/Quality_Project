'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { api, ApiError, apiFetch } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { useApiData } from '@/lib/use-api-data';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';

interface EmailLog {
  id: string;
  to: string;
  kind: 'INVOICE' | 'VOID_NOTICE' | 'REISSUE';
  status: 'SENT' | 'FAILED';
  error: string | null;
  createdAt: string;
}

const KIND: Record<EmailLog['kind'], string> = {
  INVOICE: 'Factura',
  REISSUE: 'Factura corregida',
  VOID_NOTICE: 'Aviso de anulación'
};

/** SWR-MAIL-002: enviar o reintentar la factura por correo y ver el historial de envíos. */
export function InvoiceEmail({ saleId, customerEmail }: { saleId: string; customerEmail?: string | null }) {
  const history = useApiData<EmailLog[]>(api(`sales/${saleId}/emails`));
  const [to, setTo] = useState(customerEmail ?? '');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function send(e: FormEvent) {
    e.preventDefault();
    const target = to.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) return setError('Escribe un correo válido');
    setSending(true);
    setError(null);
    try {
      const res = await apiFetch<{ status: 'SENT' | 'FAILED'; to: string; error?: string }>(
        api(`sales/${saleId}/send-invoice`),
        { method: 'POST', body: { to: target } }
      );
      if (res.status === 'SENT') toast.success(`Factura enviada a ${res.to}`);
      else setError(res.error ?? 'No se pudo enviar la factura');
      await history.reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo enviar la factura');
    } finally {
      setSending(false);
    }
  }

  return (
    <section aria-labelledby='invoice-email-title' className='mx-auto max-w-2xl space-y-3 print:hidden'>
      <h2 id='invoice-email-title' className='font-semibold'>
        Enviar por correo
      </h2>
      <form onSubmit={send} noValidate className='flex flex-wrap items-end gap-2'>
        <Field data-invalid={!!error} className='min-w-60 flex-1'>
          <FieldLabel htmlFor='invoice-to'>Correo del cliente</FieldLabel>
          <Input id='invoice-to' type='email' value={to} onChange={(e) => setTo(e.target.value)} aria-invalid={!!error} />
        </Field>
        <Button type='submit' disabled={sending}>
          Enviar
        </Button>
      </form>
      {error && <FieldError role='alert'>{error}</FieldError>}
      {!!history.data?.length && (
        <ul className='space-y-1 text-sm' aria-label='Historial de envíos'>
          {history.data.map((h) => (
            <li key={h.id} className='flex flex-wrap items-center gap-2'>
              <Badge variant={h.status === 'SENT' ? 'default' : 'destructive'}>
                {h.status === 'SENT' ? 'Enviado' : 'Falló'}
              </Badge>
              <span>
                {KIND[h.kind]} a {h.to} · {formatDateTime(h.createdAt)}
              </span>
              {h.error && <span className='text-muted-foreground'>({h.error})</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
