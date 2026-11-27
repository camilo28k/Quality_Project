'use client';

import { EmptyState, LoadError, LoadingRows } from '@/components/load-states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PASSWORD_HINT, PASSWORD_RULE } from '@/features/account/change-password-form';
import { api, ApiError, apiFetch } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { useApiData } from '@/lib/use-api-data';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import type { CompanySummary } from './types';

const schema = z.object({
  tradeName: z.string().trim().min(1, 'El nombre de la empresa es obligatorio').max(120, 'Máximo 120 caracteres'),
  adminName: z.string().trim().min(1, 'El nombre del administrador es obligatorio').max(80, 'Máximo 80 caracteres'),
  adminEmail: z.string().trim().toLowerCase().email('El correo del administrador no es válido'),
  temporaryPassword: z.string().regex(PASSWORD_RULE, `La contraseña temporal no cumple: ${PASSWORD_HINT.toLowerCase()}`)
});
type Key = keyof z.infer<typeof schema>;

/** Estado de la empresa en una etiqueta: inactiva, configurando o activa. */
export function CompanyStatus({ c }: { c: Pick<CompanySummary, 'active' | 'onboardingCompleted' | 'emailVerifiedAt'> }) {
  return (
    <span className='flex flex-wrap gap-1'>
      {!c.active ? (
        <Badge variant='destructive'>Desactivada</Badge>
      ) : !c.onboardingCompleted ? (
        <Badge variant='secondary'>Configurando</Badge>
      ) : (
        <Badge>Activa</Badge>
      )}
      {c.onboardingCompleted && !c.emailVerifiedAt && <Badge variant='outline'>Correo sin verificar</Badge>}
    </span>
  );
}

/** Panel del SUPER_ADMIN: empresas de la plataforma y alta de una empresa con su ADMIN. */
export function CompaniesManager() {
  const { data, error, loading, reload } = useApiData<CompanySummary[]>(api('platform/companies'));
  const [errors, setErrors] = useState<Partial<Record<Key, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setFormError(null);
    const parsed = schema.safeParse(Object.fromEntries(new FormData(form)));
    if (!parsed.success) {
      const next: Partial<Record<Key, string>> = {};
      for (const issue of parsed.error.issues) next[issue.path[0] as Key] ??= issue.message;
      setErrors(next);
      return;
    }
    setErrors({});
    setSaving(true);
    const { tradeName, adminName, adminEmail, temporaryPassword } = parsed.data;
    let companyId: string | null = null;
    try {
      const company = await apiFetch<{ id: string }>(api('platform/companies'), { method: 'POST', body: { tradeName } });
      companyId = company.id;
      await apiFetch(api(`platform/companies/${company.id}/admin`), {
        method: 'POST',
        body: { name: adminName, email: adminEmail, temporaryPassword }
      });
      toast.success(`Empresa «${tradeName}» creada. Entrega al administrador su correo y la contraseña temporal.`);
      form.reset();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'No se pudo crear la empresa';
      // Si la empresa se creó pero el ADMIN no, se avisa para completarlo desde el detalle.
      setFormError(companyId ? `La empresa se creó, pero no su administrador: ${msg}. Complétalo desde el detalle.` : msg);
    } finally {
      setSaving(false);
      await reload();
    }
  }

  const field = (key: Key, label: string, type = 'text', hint?: string) => (
    <Field data-invalid={!!errors[key]}>
      <FieldLabel htmlFor={`co-${key}`}>{label}</FieldLabel>
      <Input
        id={`co-${key}`}
        name={key}
        type={type}
        autoComplete='off'
        aria-invalid={!!errors[key]}
        aria-describedby={errors[key] ? `co-${key}-error` : undefined}
      />
      {hint && !errors[key] && <FieldDescription>{hint}</FieldDescription>}
      {errors[key] && <FieldError id={`co-${key}-error`}>{errors[key]}</FieldError>}
    </Field>
  );

  return (
    <div className='grid gap-4 xl:grid-cols-[22rem_1fr]'>
      <Card>
        <CardHeader>
          <CardTitle>Nueva empresa</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onCreate} noValidate className='space-y-4'>
            {formError && (
              <p role='alert' className='text-destructive text-sm'>
                {formError}
              </p>
            )}
            <FieldGroup>
              {field('tradeName', 'Nombre de la empresa', 'text', 'Provisional: el administrador lo completa en su primer ingreso.')}
              {field('adminName', 'Nombre del administrador')}
              {field('adminEmail', 'Correo del administrador', 'email')}
              {field('temporaryPassword', 'Contraseña temporal', 'text', `${PASSWORD_HINT} Deberá cambiarla al entrar.`)}
            </FieldGroup>
            <Button type='submit' disabled={saving}>
              {saving && <Spinner />}
              Crear empresa
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className='min-w-0 overflow-x-auto'>
        {loading && !data ? (
          <LoadingRows label='Cargando empresas' />
        ) : error ? (
          <LoadError message={error} onRetry={reload} />
        ) : !data?.length ? (
          <EmptyState title='Sin empresas' description='Crea la primera empresa de la plataforma.' />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empresa</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className='text-right'>Usuarios</TableHead>
                <TableHead className='text-right'>Productos</TableHead>
                <TableHead className='text-right'>Ventas</TableHead>
                <TableHead>Creada</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className='font-medium'>
                    <Link href={`/dashboard/empresas/${c.id}`} className='hover:underline'>
                      {c.tradeName}
                    </Link>
                    {c.email && <span className='text-muted-foreground block text-xs font-normal'>{c.email}</span>}
                  </TableCell>
                  <TableCell>
                    <CompanyStatus c={c} />
                  </TableCell>
                  <TableCell className='text-right tabular-nums'>{c._count.users}</TableCell>
                  <TableCell className='text-right tabular-nums'>{c._count.products}</TableCell>
                  <TableCell className='text-right tabular-nums'>{c._count.sales}</TableCell>
                  <TableCell className='whitespace-nowrap'>{formatDateTime(c.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
