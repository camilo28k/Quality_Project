'use client';

import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

/** Campo de texto del formulario de empresa con error y ayuda accesibles. */
export function CompanyField({
  name,
  label,
  value,
  onChange,
  error,
  hint,
  required,
  type = 'text',
  multiline,
  inputMode
}: {
  name: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  hint?: string;
  required?: boolean;
  type?: string;
  multiline?: boolean;
  inputMode?: 'numeric' | 'email' | 'tel' | 'text' | 'url';
}) {
  const describedBy = error ? `${name}-error` : hint ? `${name}-hint` : undefined;
  const common = {
    id: name,
    name,
    value,
    'aria-invalid': !!error,
    'aria-describedby': describedBy,
    'aria-required': required || undefined
  };
  return (
    <Field data-invalid={!!error}>
      <FieldLabel htmlFor={name}>
        {label}
        {required && <span aria-hidden='true'> *</span>}
      </FieldLabel>
      {multiline ? (
        <textarea
          {...common}
          rows={3}
          onChange={(e) => onChange(e.target.value)}
          className='border-input bg-background focus-visible:ring-ring/50 min-h-20 w-full rounded-md border px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px] aria-invalid:border-destructive'
        />
      ) : (
        <Input {...common} type={type} inputMode={inputMode} onChange={(e) => onChange(e.target.value)} />
      )}
      {hint && !error && <FieldDescription id={`${name}-hint`}>{hint}</FieldDescription>}
      {error && <FieldError id={`${name}-error`}>{error}</FieldError>}
    </Field>
  );
}
