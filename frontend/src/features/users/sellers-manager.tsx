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
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PASSWORD_HINT, PASSWORD_RULE } from '@/features/account/change-password-form';
import { api, ApiError, apiFetch } from '@/lib/api';
import { ROLE_LABEL, type Role } from '@/lib/session-types';
import { useApiData } from '@/lib/use-api-data';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';

export interface CompanyUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  mustChangePassword: boolean;
}

const schema = z.object({
  name: z.string().trim().min(1, 'El nombre es obligatorio').max(80, 'Máximo 80 caracteres'),
  email: z.string().trim().toLowerCase().email('El correo no tiene un formato válido'),
  temporaryPassword: z.string().regex(PASSWORD_RULE, `La contraseña temporal no cumple: ${PASSWORD_HINT.toLowerCase()}`)
});
type Key = keyof z.infer<typeof schema>;

/** SWR-ROLE-002: el ADMIN crea, edita, activa y desactiva vendedores de su empresa. */
export function SellersManager() {
  const { data, error, loading, reload } = useApiData<CompanyUser[]>(api('users'));
  const [errors, setErrors] = useState<Partial<Record<Key, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<CompanyUser | null>(null);

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
    try {
      await apiFetch(api('users'), { method: 'POST', body: parsed.data });
      toast.success('Vendedor creado. Entrégale su correo y la contraseña temporal.');
      form.reset();
      await reload();
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : 'No se pudo crear el vendedor');
    } finally {
      setSaving(false);
    }
  }

  async function setActive(u: CompanyUser, active: boolean) {
    try {
      await apiFetch(api(`users/${u.id}/${active ? 'activate' : 'deactivate'}`), { method: 'PATCH' });
      toast.success(active ? `${u.name} fue activado` : `${u.name} fue desactivado`);
      await reload();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'No se pudo actualizar el vendedor');
    }
  }

  const field = (key: Key, label: string, type: string, hint?: string) => (
    <Field data-invalid={!!errors[key]}>
      <FieldLabel htmlFor={`seller-${key}`}>{label}</FieldLabel>
      <Input
        id={`seller-${key}`}
        name={key}
        type={type}
        autoComplete='off'
        aria-invalid={!!errors[key]}
        aria-describedby={errors[key] ? `seller-${key}-error` : undefined}
      />
      {hint && !errors[key] && <FieldDescription>{hint}</FieldDescription>}
      {errors[key] && <FieldError id={`seller-${key}-error`}>{errors[key]}</FieldError>}
    </Field>
  );

  return (
    <div className='grid gap-4 lg:grid-cols-[22rem_1fr]'>
      <Card>
        <CardHeader>
          <CardTitle>Nuevo vendedor</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onCreate} noValidate className='space-y-4'>
            {formError && (
              <p role='alert' className='text-destructive text-sm'>
                {formError}
              </p>
            )}
            <FieldGroup>
              {field('name', 'Nombre', 'text')}
              {field('email', 'Correo', 'email')}
              {field(
                'temporaryPassword',
                'Contraseña temporal',
                'text',
                `${PASSWORD_HINT} El vendedor deberá cambiarla al entrar.`
              )}
            </FieldGroup>
            <Button type='submit' disabled={saving}>
              {saving && <Spinner />}
              Crear vendedor
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* min-w-0 evita que la tabla desborde la columna en pantallas angostas */}
      <div className='min-w-0 overflow-x-auto'>
        {loading && !data ? (
          <LoadingRows label='Cargando usuarios' />
        ) : error ? (
          <LoadError message={error} onRetry={reload} />
        ) : !data?.some((u) => u.role === 'SELLER') ? (
          <EmptyState title='Sin vendedores' description='Crea el primer vendedor para que pueda iniciar sesión y vender.' />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Correo</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className='text-right'>Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className='font-medium'>{u.name}</TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>{ROLE_LABEL[u.role]}</TableCell>
                  <TableCell>
                    {!u.active ? (
                      <Badge variant='outline'>Inactivo</Badge>
                    ) : u.mustChangePassword ? (
                      <Badge variant='secondary'>Contraseña temporal</Badge>
                    ) : (
                      <Badge>Activo</Badge>
                    )}
                  </TableCell>
                  <TableCell className='space-x-2 text-right whitespace-nowrap'>
                    {u.role === 'SELLER' && (
                      <>
                        <Button variant='outline' size='sm' onClick={() => setEditing(u)}>
                          Editar
                        </Button>
                        {u.active ? (
                          <AlertDialog>
                            <AlertDialogTrigger render={<Button variant='destructive' size='sm' />}>
                              Desactivar
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>¿Desactivar a {u.name}?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  No podrá iniciar sesión y su sesión abierta se cierra. Sus ventas se conservan.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction variant='destructive' onClick={() => setActive(u, false)}>
                                  Desactivar
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        ) : (
                          <Button size='sm' onClick={() => setActive(u, true)}>
                            Activar
                          </Button>
                        )}
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {editing && <EditSeller user={editing} onClose={() => setEditing(null)} onSaved={reload} />}
      </div>
    </div>
  );
}

function EditSeller({ user, onClose, onSaved }: { user: CompanyUser; onClose: () => void; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = schema.pick({ name: true, email: true }).safeParse({ name, email });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setSaving(true);
    try {
      await apiFetch(api(`users/${user.id}`), { method: 'PATCH', body: parsed.data });
      toast.success('Vendedor actualizado');
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo actualizar el vendedor');
      setSaving(false);
    }
  }

  return (
    <Card className='mt-4'>
      <CardHeader>
        <CardTitle>Editar a {user.name}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} noValidate className='grid gap-4 sm:grid-cols-2'>
          <Field>
            <FieldLabel htmlFor='edit-name'>Nombre</FieldLabel>
            <Input id='edit-name' value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor='edit-email'>Correo</FieldLabel>
            <Input id='edit-email' type='email' value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          {error && (
            <p role='alert' className='text-destructive text-sm sm:col-span-2'>
              {error}
            </p>
          )}
          <div className='flex gap-2 sm:col-span-2'>
            <Button type='submit' disabled={saving}>
              Guardar
            </Button>
            <Button type='button' variant='ghost' onClick={onClose}>
              Cancelar
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
