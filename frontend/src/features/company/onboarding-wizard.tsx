'use client';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { api, ApiError, apiFetch } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { CompanyField } from './company-field';
import { compact, companyFields, type CompanyFieldKey } from './company-schema';

type Values = Record<CompanyFieldKey, string>;

const STEPS: { title: string; fields: CompanyFieldKey[] }[] = [
  { title: 'Datos de la empresa', fields: ['tradeName', 'legalName', 'taxId', 'description', 'logoUrl'] },
  { title: 'Contacto', fields: ['email', 'phone', 'address', 'city'] },
  { title: 'Facturación', fields: ['invoicePrefix', 'firstInvoiceNumber', 'invoiceFooter'] },
  { title: 'Resumen', fields: [] }
];

const LABELS: Record<CompanyFieldKey, string> = {
  tradeName: 'Nombre comercial',
  legalName: 'Razón social',
  taxId: 'NIT',
  description: 'Descripción',
  logoUrl: 'URL del logo',
  email: 'Correo de la empresa',
  phone: 'Teléfono',
  address: 'Dirección',
  city: 'Ciudad',
  invoicePrefix: 'Prefijo de factura',
  firstInvoiceNumber: 'Consecutivo inicial',
  invoiceFooter: 'Nota al pie de la factura'
};

const REQUIRED = new Set<CompanyFieldKey>(['tradeName', 'taxId', 'email', 'invoicePrefix', 'firstInvoiceNumber']);

const HINTS: Partial<Record<CompanyFieldKey, string>> = {
  taxId: 'Con guion y dígito de verificación, p. ej. 900123456-8.',
  email: 'Las facturas se enviarán a nombre de este correo. Se verificará más adelante.',
  logoUrl: 'Opcional. Una imagen pública https para la factura.',
  invoicePrefix: 'Aparece antes del número, p. ej. TND-120.',
  firstInvoiceNumber: 'Si ya facturabas, escribe el siguiente número que te corresponde.'
};

/** SWR-ONB-001: asistente obligatorio del ADMIN en su primer ingreso. */
export function OnboardingWizard({ initialName }: { initialName: string }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<Values>({
    tradeName: initialName,
    legalName: '',
    taxId: '',
    description: '',
    logoUrl: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    invoicePrefix: 'FAC-',
    firstInvoiceNumber: '1',
    invoiceFooter: ''
  });
  const [errors, setErrors] = useState<Partial<Record<CompanyFieldKey, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = (key: CompanyFieldKey) => (v: string) =>
    setValues((prev) => ({ ...prev, [key]: key === 'invoicePrefix' ? v.toUpperCase() : v }));

  function validate(fields: CompanyFieldKey[]): boolean {
    const shape = Object.fromEntries(fields.map((f) => [f, companyFields[f]]));
    const parsed = z.object(shape).safeParse(values);
    if (parsed.success) {
      setErrors({});
      return true;
    }
    const next: Partial<Record<CompanyFieldKey, string>> = {};
    for (const issue of parsed.error.issues) next[issue.path[0] as CompanyFieldKey] ??= issue.message;
    setErrors(next);
    return false;
  }

  async function submit() {
    const all = STEPS.flatMap((s) => s.fields);
    if (!validate(all)) {
      // Lleva al primer paso con errores.
      const parsed = z.object(Object.fromEntries(all.map((f) => [f, companyFields[f]]))).safeParse(values);
      const firstBad = parsed.success ? null : (parsed.error.issues[0].path[0] as CompanyFieldKey);
      setStep(STEPS.findIndex((s) => firstBad && s.fields.includes(firstBad)));
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const body = { ...compact(values), firstInvoiceNumber: Number(values.firstInvoiceNumber) };
      await apiFetch(api('company/onboarding'), { method: 'POST', body });
      toast.success('Empresa configurada');
      router.replace('/dashboard');
      router.refresh();
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : 'No se pudo guardar la configuración');
      setSaving(false);
    }
  }

  const current = STEPS[step];
  const preview = `${values.invoicePrefix || 'FAC-'}${values.firstInvoiceNumber || '1'}`;

  return (
    <div className='space-y-4'>
      <ol className='grid grid-cols-4 gap-2' aria-label='Pasos de la configuración'>
        {STEPS.map((s, i) => (
          <li key={s.title} aria-current={i === step ? 'step' : undefined} className='space-y-1'>
            <div className={`h-1.5 rounded-full ${i <= step ? 'bg-primary' : 'bg-muted'}`} />
            <span className={`block text-xs ${i === step ? 'font-medium' : 'text-muted-foreground'}`}>
              {i + 1}. {s.title}
            </span>
          </li>
        ))}
      </ol>

      <Card>
        <CardHeader>
          <CardTitle>{current.title}</CardTitle>
        </CardHeader>
        <CardContent className='space-y-4'>
          {formError && (
            <Alert variant='destructive' role='alert'>
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}
          {current.fields.map((f) => (
            <CompanyField
              key={f}
              name={f}
              label={LABELS[f]}
              value={values[f]}
              onChange={set(f)}
              error={errors[f]}
              hint={HINTS[f]}
              required={REQUIRED.has(f)}
              multiline={f === 'description' || f === 'invoiceFooter'}
              type={f === 'email' ? 'email' : 'text'}
              inputMode={f === 'firstInvoiceNumber' ? 'numeric' : f === 'phone' ? 'tel' : undefined}
            />
          ))}
          {step === 2 && (
            <p className='text-muted-foreground text-sm' aria-live='polite'>
              Tu primera factura será la <strong className='text-foreground'>{preview}</strong>.
            </p>
          )}
          {step === 3 && (
            <dl className='grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[12rem_1fr]'>
              {STEPS.flatMap((s) => s.fields)
                .filter((f) => values[f])
                .map((f) => (
                  <div key={f} className='contents'>
                    <dt className='text-muted-foreground'>{LABELS[f]}</dt>
                    <dd className='break-words'>{values[f]}</dd>
                  </div>
                ))}
              <dt className='text-muted-foreground'>Moneda y zona horaria</dt>
              <dd>COP · America/Bogota</dd>
            </dl>
          )}
          <div className='flex justify-between gap-2 pt-2'>
            <Button type='button' variant='outline' disabled={step === 0 || saving} onClick={() => setStep(step - 1)}>
              Atrás
            </Button>
            {step < STEPS.length - 1 ? (
              <Button type='button' onClick={() => validate(current.fields) && setStep(step + 1)}>
                Siguiente
              </Button>
            ) : (
              <Button type='button' onClick={submit} disabled={saving}>
                {saving && <Spinner />}
                Confirmar y empezar
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
