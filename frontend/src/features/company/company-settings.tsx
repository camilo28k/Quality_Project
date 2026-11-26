'use client';

import { LoadError, LoadingRows } from '@/components/load-states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { api, ApiError, apiFetch } from '@/lib/api';
import { useApiData } from '@/lib/use-api-data';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { CompanyField } from './company-field';
import { companyFields, type CompanyFieldKey, type CompanyProfile } from './company-schema';

type Editable = Exclude<CompanyFieldKey, 'firstInvoiceNumber'>;
const FIELDS: { key: Editable; label: string; required?: boolean; multiline?: boolean }[] = [
  { key: 'tradeName', label: 'Nombre comercial', required: true },
  { key: 'legalName', label: 'Razón social' },
  { key: 'taxId', label: 'NIT', required: true },
  { key: 'email', label: 'Correo de la empresa', required: true },
  { key: 'phone', label: 'Teléfono' },
  { key: 'city', label: 'Ciudad' },
  { key: 'address', label: 'Dirección' },
  { key: 'logoUrl', label: 'URL del logo' },
  { key: 'invoicePrefix', label: 'Prefijo de factura', required: true },
  { key: 'description', label: 'Descripción', multiline: true },
  { key: 'invoiceFooter', label: 'Nota al pie de la factura', multiline: true }
];

/** Edición de los datos de la empresa por el ADMIN (después del asistente). */
export function CompanySettings() {
  const { data, error, loading, reload } = useApiData<CompanyProfile>(api('company'));
  if (loading && !data) return <LoadingRows label='Cargando empresa' />;
  if (error) return <LoadError message={error} onRetry={reload} />;
  if (!data) return null;
  return <SettingsForm data={data} reload={reload} />;
}

function SettingsForm({ data, reload }: { data: CompanyProfile; reload: () => Promise<void> }) {
  const [values, setValues] = useState<Record<Editable, string>>(
    () => Object.fromEntries(FIELDS.map((f) => [f.key, data[f.key] ?? ''])) as Record<Editable, string>
  );
  const [errors, setErrors] = useState<Partial<Record<Editable, string>>>({});
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const shape = Object.fromEntries(FIELDS.map((f) => [f.key, companyFields[f.key]]));
    const parsed = z.object(shape).safeParse(values);
    if (!parsed.success) {
      const next: Partial<Record<Editable, string>> = {};
      for (const issue of parsed.error.issues) next[issue.path[0] as Editable] ??= issue.message;
      setErrors(next);
      return;
    }
    setErrors({});
    // Solo se envía lo que cambió.
    const changed = Object.fromEntries(
      FIELDS.filter((f) => values[f.key] !== (data[f.key] ?? '')).map((f) => [f.key, values[f.key]])
    );
    if (Object.keys(changed).length === 0) {
      toast.info('No hay cambios para guardar');
      return;
    }
    setSaving(true);
    try {
      await apiFetch(api('company'), { method: 'PATCH', body: changed });
      toast.success('Datos de la empresa actualizados');
      await reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudieron guardar los cambios');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader className='flex flex-row items-center justify-between gap-2'>
        <CardTitle>{data.tradeName}</CardTitle>
        {data.emailVerifiedAt ? (
          <Badge>Correo verificado</Badge>
        ) : (
          <Badge variant='secondary'>Correo sin verificar</Badge>
        )}
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} noValidate className='grid gap-4 md:grid-cols-2'>
          {FIELDS.map((f) => (
            <div key={f.key} className={f.multiline ? 'md:col-span-2' : undefined}>
              <CompanyField
                name={f.key}
                label={f.label}
                required={f.required}
                multiline={f.multiline}
                value={values[f.key]}
                error={errors[f.key]}
                onChange={(v) =>
                  setValues((prev) => ({ ...prev, [f.key]: f.key === 'invoicePrefix' ? v.toUpperCase() : v }))
                }
              />
            </div>
          ))}
          <p className='text-muted-foreground text-sm md:col-span-2'>
            Próxima factura: <strong className='text-foreground'>{`${data.invoicePrefix}${data.nextInvoiceNumber}`}</strong> ·
            Moneda {data.currency} · {data.timezone}
          </p>
          <div className='md:col-span-2'>
            <Button type='submit' disabled={saving}>
              {saving && <Spinner />}
              Guardar cambios
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
