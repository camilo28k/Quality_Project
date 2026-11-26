'use client';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { api, ApiError, apiFetch } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';

export const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d).{10,72}$/;
export const PASSWORD_HINT = 'Entre 10 y 72 caracteres, con letras y números.';

const schema = z
  .object({
    currentPassword: z.string().min(1, 'La contraseña actual es obligatoria'),
    newPassword: z.string().regex(PASSWORD_RULE, `La nueva contraseña no cumple: ${PASSWORD_HINT.toLowerCase()}`),
    confirm: z.string()
  })
  .refine((d) => d.newPassword === d.confirm, { path: ['confirm'], message: 'Las contraseñas no coinciden' })
  .refine((d) => d.newPassword !== d.currentPassword, {
    path: ['newPassword'],
    message: 'La nueva contraseña debe ser distinta de la actual'
  });

type Key = 'currentPassword' | 'newPassword' | 'confirm';

/** SWR-ONB-001: cambio de contraseña (obligatorio si es temporal). Usa POST /auth/change-password. */
export function ChangePasswordForm({ mandatory }: { mandatory: boolean }) {
  const router = useRouter();
  const [errors, setErrors] = useState<Partial<Record<Key, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const parsed = schema.safeParse(Object.fromEntries(new FormData(event.currentTarget)));
    if (!parsed.success) {
      const next: Partial<Record<Key, string>> = {};
      for (const issue of parsed.error.issues) next[issue.path[0] as Key] ??= issue.message;
      setErrors(next);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      const { currentPassword, newPassword } = parsed.data;
      await apiFetch(api('auth/change-password'), { method: 'POST', body: { currentPassword, newPassword } });
      toast.success('Contraseña actualizada');
      // El panel decide si falta la configuración inicial de la empresa.
      router.replace('/dashboard');
      router.refresh();
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : 'No se pudo cambiar la contraseña');
      setSaving(false);
    }
  }

  const field = (key: Key, label: string, autoComplete: string, hint?: string) => (
    <Field data-invalid={!!errors[key]}>
      <FieldLabel htmlFor={key}>{label}</FieldLabel>
      <Input
        id={key}
        name={key}
        type='password'
        autoComplete={autoComplete}
        aria-invalid={!!errors[key]}
        aria-describedby={errors[key] ? `${key}-error` : undefined}
      />
      {hint && !errors[key] && <FieldDescription>{hint}</FieldDescription>}
      {errors[key] && <FieldError id={`${key}-error`}>{errors[key]}</FieldError>}
    </Field>
  );

  return (
    <form onSubmit={onSubmit} noValidate className='space-y-4'>
      {mandatory && (
        <Alert>
          <AlertDescription>Tu cuenta tiene una contraseña temporal. Cámbiala para continuar.</AlertDescription>
        </Alert>
      )}
      {formError && (
        <Alert variant='destructive' role='alert'>
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}
      <FieldGroup>
        {field('currentPassword', mandatory ? 'Contraseña temporal' : 'Contraseña actual', 'current-password')}
        {field('newPassword', 'Nueva contraseña', 'new-password', PASSWORD_HINT)}
        {field('confirm', 'Confirmar nueva contraseña', 'new-password')}
      </FieldGroup>
      <Button type='submit' className='w-full' size='lg' disabled={saving}>
        {saving && <Spinner />}
        Cambiar contraseña
      </Button>
      {!mandatory && (
        <Button type='button' variant='ghost' className='w-full' onClick={() => router.back()}>
          Cancelar
        </Button>
      )}
    </form>
  );
}
