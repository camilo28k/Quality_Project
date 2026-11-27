'use client';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { api, ApiError, apiFetch } from '@/lib/api';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';

/**
 * SWR-MAIL-001: el ADMIN verifica el correo de la empresa con un código de 6 dígitos.
 * Hasta verificarlo, las facturas no se envían a nombre de la empresa.
 */
export function EmailVerification({
  email,
  verifiedAt,
  onVerified
}: {
  email: string | null;
  verifiedAt: string | null;
  onVerified: () => Promise<void> | void;
}) {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (verifiedAt) return null;
  if (!email)
    return (
      <Alert>
        <AlertDescription>Registra el correo de la empresa para poder enviar facturas.</AlertDescription>
      </Alert>
    );

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch<{ sentTo: string; expiresInMinutes: number }>(api('company/email/send-code'), {
        method: 'POST',
        body: {}
      });
      setSentTo(res.sentTo);
      toast.success(`Código enviado a ${res.sentTo}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo enviar el código');
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    if (!/^\d{6}$/.test(code.trim())) return setError('El código tiene 6 dígitos');
    setBusy(true);
    setError(null);
    try {
      await apiFetch(api('company/email/verify'), { method: 'POST', body: { code: code.trim() } });
      toast.success('Correo de la empresa verificado');
      await onVerified();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo verificar el código');
      setBusy(false);
    }
  }

  // Región con nombre (no role=alert): solo el error se anuncia como alerta.
  return (
    <Alert role='region' aria-labelledby='verify-email-title'>
      <AlertTitle id='verify-email-title'>Verifica el correo de la empresa</AlertTitle>
      <AlertDescription className='space-y-3'>
        <p>
          Las facturas salen con el nombre de tu empresa y las respuestas de los clientes llegan a <strong>{email}</strong>.
          Antes hay que confirmar que ese correo es tuyo.
        </p>
        {!sentTo ? (
          <Button type='button' size='sm' onClick={send} disabled={busy}>
            Enviar código a {email}
          </Button>
        ) : (
          <form onSubmit={verify} noValidate className='flex flex-wrap items-end gap-2'>
            <Field data-invalid={!!error} className='w-40'>
              <FieldLabel htmlFor='verify-code'>Código</FieldLabel>
              <Input
                id='verify-code'
                inputMode='numeric'
                autoComplete='one-time-code'
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                aria-invalid={!!error}
              />
              <FieldDescription>Vence en 15 minutos.</FieldDescription>
            </Field>
            <Button type='submit' size='sm' disabled={busy}>
              Verificar
            </Button>
            <Button type='button' size='sm' variant='ghost' onClick={send} disabled={busy}>
              Reenviar
            </Button>
          </form>
        )}
        {error && <FieldError role='alert'>{error}</FieldError>}
      </AlertDescription>
    </Alert>
  );
}
