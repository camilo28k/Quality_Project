'use client';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { ApiError, apiFetch } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { z } from 'zod';

const schema = z.object({
  email: z.string().trim().min(1, 'El correo es obligatorio').email('El correo no tiene un formato válido'),
  password: z.string().min(1, 'La contraseña es obligatoria')
});

type Errors = Partial<Record<'email' | 'password', string>>;

/** SWR-AUTH-001 / SWR-AUTH-002 */
export function LoginForm() {
  const router = useRouter();
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const parsed = schema.safeParse(data);
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof Errors;
        next[key] ??= issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      await apiFetch('/api/auth/login', { method: 'POST', body: parsed.data });
      router.replace('/dashboard');
      router.refresh();
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : 'No se pudo iniciar sesión');
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className='space-y-4'>
      {formError && (
        <Alert variant='destructive' role='alert'>
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}
      <FieldGroup>
        <Field data-invalid={!!errors.email}>
          <FieldLabel htmlFor='email'>Correo electrónico</FieldLabel>
          <Input
            id='email'
            name='email'
            type='email'
            autoComplete='email'
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? 'email-error' : undefined}
          />
          {errors.email && <FieldError id='email-error'>{errors.email}</FieldError>}
        </Field>
        <Field data-invalid={!!errors.password}>
          <FieldLabel htmlFor='password'>Contraseña</FieldLabel>
          <Input
            id='password'
            name='password'
            type='password'
            autoComplete='current-password'
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? 'password-error' : undefined}
          />
          {errors.password && <FieldError id='password-error'>{errors.password}</FieldError>}
        </Field>
      </FieldGroup>
      <Button type='submit' className='w-full' size='lg' disabled={submitting}>
        {submitting && <Spinner />}
        Ingresar
      </Button>
    </form>
  );
}
