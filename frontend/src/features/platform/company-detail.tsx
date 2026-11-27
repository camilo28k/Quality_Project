'use client';

import { LoadError, LoadingRows } from '@/components/load-states';
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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PASSWORD_HINT, PASSWORD_RULE } from '@/features/account/change-password-form';
import { AuditLogView } from '@/features/audit/audit-log';
import { api, ApiError, apiFetch } from '@/lib/api';
import { formatCOP, formatDateTime } from '@/lib/format';
import { ROLE_LABEL } from '@/lib/session-types';
import { useApiData } from '@/lib/use-api-data';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { CompanyStatus } from './companies-manager';
import type { CompanyDetail as Detail } from './types';

const errorOf = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

/** SUPER_ADMIN: detalle de una empresa, sus usuarios, su estado y su auditoría. */
export function CompanyDetail({ id }: { id: string }) {
  const { data, error, loading, reload } = useApiData<Detail>(api(`platform/companies/${id}`));
  const [resetFor, setResetFor] = useState<Detail['users'][number] | null>(null);

  if (loading && !data) return <LoadingRows label='Cargando empresa' />;
  if (error) return <LoadError message={error} onRetry={reload} />;
  if (!data) return null;
  const c = data;

  async function setActive(active: boolean) {
    try {
      await apiFetch(api(`platform/companies/${id}/${active ? 'activate' : 'deactivate'}`), { method: 'PATCH' });
      toast.success(active ? 'Empresa activada' : 'Empresa desactivada: sus usuarios ya no pueden entrar');
      await reload();
    } catch (e) {
      toast.error(errorOf(e, 'No se pudo cambiar el estado'));
    }
  }

  return (
    <div className='min-w-0 space-y-4'>
      <div className='flex flex-wrap items-center gap-2'>
        <Button variant='outline' render={<Link href='/dashboard/empresas' />}>
          Volver
        </Button>
        <CompanyStatus c={c} />
        <span className='ml-auto' />
        {c.active ? (
          <AlertDialog>
            <AlertDialogTrigger render={<Button variant='destructive' />}>Desactivar empresa</AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Desactivar «{c.tradeName}»?</AlertDialogTitle>
                <AlertDialogDescription>
                  Sus {c.users.length} usuario(s) no podrán iniciar sesión y las sesiones abiertas se cierran de inmediato.
                  Los datos, las ventas y las facturas se conservan. Puedes reactivarla cuando quieras.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction variant='destructive' onClick={() => setActive(false)}>
                  Desactivar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : (
          <Button onClick={() => setActive(true)}>Activar empresa</Button>
        )}
      </div>

      {/* El área de contenido es más angosta que la ventana (menú lateral): 3 columnas solo en pantallas muy anchas. */}
      <div className='grid gap-4 md:grid-cols-2 2xl:grid-cols-3 [&>*]:min-w-0'>
        <Card>
          <CardHeader>
            <CardTitle>Ventas confirmadas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className='text-2xl font-bold tabular-nums'>{c.stats.confirmedSales}</p>
            <p className='text-muted-foreground text-sm'>Total {formatCOP(c.stats.salesTotal)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Facturación</CardTitle>
          </CardHeader>
          <CardContent className='text-sm'>
            <p>NIT {c.taxId ?? '—'}</p>
            <p>
              Próxima factura <strong>{`${c.invoicePrefix}${c.nextInvoiceNumber}`}</strong>
            </p>
            <p className='text-muted-foreground'>Creada {formatDateTime(c.createdAt)}</p>
          </CardContent>
        </Card>
        <EditCompany company={c} onSaved={reload} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Usuarios</CardTitle>
        </CardHeader>
        <CardContent className='space-y-4 overflow-x-auto'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Correo</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className='sr-only'>Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {c.users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className='font-medium'>{u.name}</TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>{ROLE_LABEL[u.role]}</TableCell>
                  <TableCell>{u.active ? <Badge>Activo</Badge> : <Badge variant='outline'>Inactivo</Badge>}</TableCell>
                  <TableCell className='text-right'>
                    <Button size='sm' variant='outline' onClick={() => setResetFor(u)}>
                      Restablecer contraseña
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <AddAdmin companyId={id} onSaved={reload} />
        </CardContent>
      </Card>

      <section aria-labelledby='company-audit' className='space-y-2'>
        <h2 id='company-audit' className='text-lg font-semibold'>
          Auditoría de la empresa
        </h2>
        <AuditLogView companyId={id} />
      </section>

      <Dialog open={!!resetFor} onOpenChange={(open) => !open && setResetFor(null)}>
        <DialogContent className='sm:max-w-md'>
          {resetFor && <ResetPassword user={resetFor} done={() => setResetFor(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EditCompany({ company, onSaved }: { company: Detail; onSaved: () => Promise<void> }) {
  const [tradeName, setTradeName] = useState(company.tradeName);
  const [email, setEmail] = useState(company.email ?? '');
  const [error, setError] = useState<string | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!tradeName.trim()) return setError('El nombre es obligatorio');
    const body: Record<string, string> = {};
    if (tradeName.trim() !== company.tradeName) body.tradeName = tradeName.trim();
    if (email.trim() && email.trim().toLowerCase() !== company.email) body.email = email.trim().toLowerCase();
    if (Object.keys(body).length === 0) return setError(null);
    try {
      await apiFetch(api(`platform/companies/${company.id}`), { method: 'PATCH', body });
      toast.success(body.email ? 'Empresa actualizada. El correo nuevo debe verificarse.' : 'Empresa actualizada');
      setError(null);
      await onSaved();
    } catch (err) {
      setError(errorOf(err, 'No se pudo actualizar la empresa'));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Datos básicos</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} noValidate className='space-y-3'>
          <Field>
            <FieldLabel htmlFor='edit-tradeName'>Nombre</FieldLabel>
            <Input id='edit-tradeName' value={tradeName} onChange={(e) => setTradeName(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor='edit-email'>Correo de la empresa</FieldLabel>
            <Input id='edit-email' type='email' value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          {error && <FieldError role='alert'>{error}</FieldError>}
          <Button type='submit' size='sm'>
            Guardar
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function AddAdmin({ companyId, onSaved }: { companyId: string; onSaved: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!open)
    return (
      <Button size='sm' variant='outline' onClick={() => setOpen(true)}>
        Agregar administrador
      </Button>
    );

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    if (!f.name?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email?.trim() ?? ''))
      return setError('Nombre y correo válidos son obligatorios');
    if (!PASSWORD_RULE.test(f.temporaryPassword ?? '')) return setError(`Contraseña temporal: ${PASSWORD_HINT}`);
    try {
      await apiFetch(api(`platform/companies/${companyId}/admin`), {
        method: 'POST',
        body: { name: f.name.trim(), email: f.email.trim().toLowerCase(), temporaryPassword: f.temporaryPassword }
      });
      toast.success('Administrador creado');
      setOpen(false);
      await onSaved();
    } catch (err) {
      setError(errorOf(err, 'No se pudo crear el administrador'));
    }
  }

  return (
    <form onSubmit={submit} noValidate className='grid gap-3 sm:grid-cols-4 sm:items-end'>
      <Field>
        <FieldLabel htmlFor='admin-name'>Nombre</FieldLabel>
        <Input id='admin-name' name='name' />
      </Field>
      <Field>
        <FieldLabel htmlFor='admin-email'>Correo</FieldLabel>
        <Input id='admin-email' name='email' type='email' />
      </Field>
      <Field>
        <FieldLabel htmlFor='admin-pass'>Contraseña temporal</FieldLabel>
        <Input id='admin-pass' name='temporaryPassword' autoComplete='off' />
      </Field>
      <Button type='submit'>Crear administrador</Button>
      {error && (
        <p role='alert' className='text-destructive text-sm sm:col-span-4'>
          {error}
        </p>
      )}
    </form>
  );
}

function ResetPassword({ user, done }: { user: Detail['users'][number]; done: () => void }) {
  const [error, setError] = useState<string | null>(null);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const temporaryPassword = String(new FormData(e.currentTarget).get('temporaryPassword') ?? '');
    if (!PASSWORD_RULE.test(temporaryPassword)) return setError(`La contraseña temporal no cumple: ${PASSWORD_HINT}`);
    try {
      await apiFetch(api(`platform/companies/users/${user.id}/reset-password`), {
        method: 'POST',
        body: { temporaryPassword }
      });
      toast.success(`Contraseña de ${user.name} restablecida. Deberá cambiarla al entrar.`);
      done();
    } catch (err) {
      setError(errorOf(err, 'No se pudo restablecer la contraseña'));
    }
  }
  return (
    <form onSubmit={submit} noValidate className='space-y-4'>
      <DialogHeader>
        <DialogTitle>Restablecer la contraseña de {user.name}</DialogTitle>
        <DialogDescription>
          Su sesión abierta se cierra y deberá cambiar esta contraseña temporal al entrar. Queda en la auditoría.
        </DialogDescription>
      </DialogHeader>
      <Field>
        <FieldLabel htmlFor='reset-pass'>Contraseña temporal</FieldLabel>
        <Input id='reset-pass' name='temporaryPassword' autoComplete='off' />
      </Field>
      {error && (
        <p role='alert' className='text-destructive text-sm'>
          {error}
        </p>
      )}
      <div className='flex justify-end'>
        <Button type='submit'>Restablecer</Button>
      </div>
    </form>
  );
}
