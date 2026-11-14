'use client';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { api, ApiError, apiFetch } from '@/lib/api';
import type { Category, Product } from '@/lib/types';
import { useState, type FormEvent, type ReactNode } from 'react';
import { toast } from 'sonner';
import { productSchema, type ProductField } from './product-schema';

/** SWR-PROD-001 (adaptado de product-form de la plantilla). */
export function ProductForm({ categories, onCreated }: { categories: Category[]; onCreated: (p: Product) => void }) {
  const [errors, setErrors] = useState<Partial<Record<ProductField, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setFormError(null);
    const parsed = productSchema.safeParse(Object.fromEntries(new FormData(form)));
    if (!parsed.success) {
      const next: Partial<Record<ProductField, string>> = {};
      for (const issue of parsed.error.issues) next[issue.path[0] as ProductField] ??= issue.message;
      setErrors(next);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      const product = await apiFetch<Product>(api('products'), { method: 'POST', body: parsed.data });
      toast.success(`Producto «${product.name}» registrado`);
      form.reset();
      onCreated(product);
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : 'No se pudo registrar el producto');
    } finally {
      setSaving(false);
    }
  }

  const field = (name: ProductField, label: string, input: ReactNode) => (
    <Field data-invalid={!!errors[name]}>
      <FieldLabel htmlFor={`product-${name}`}>{label}</FieldLabel>
      {input}
      {errors[name] && <FieldError>{errors[name]}</FieldError>}
    </Field>
  );
  const numberInput = (name: ProductField, step: string) => (
    <Input id={`product-${name}`} name={name} type='number' inputMode='decimal' step={step} min='0' aria-invalid={!!errors[name]} />
  );

  return (
    <form onSubmit={onSubmit} noValidate className='space-y-4'>
      {formError && (
        <Alert variant='destructive' role='alert'>
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}
      <FieldGroup>
        {field('name', 'Nombre', <Input id='product-name' name='name' maxLength={120} aria-invalid={!!errors.name} />)}
        {field(
          'categoryId',
          'Categoría',
          <NativeSelect id='product-categoryId' name='categoryId' defaultValue='' className='w-full' aria-invalid={!!errors.categoryId}>
            <NativeSelectOption value=''>Seleccione…</NativeSelectOption>
            {categories.map((c) => (
              <NativeSelectOption key={c.id} value={c.id}>
                {c.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        )}
        {field(
          'unit',
          'Unidad de medida',
          <NativeSelect id='product-unit' name='unit' defaultValue='' className='w-full' aria-invalid={!!errors.unit}>
            <NativeSelectOption value=''>Seleccione…</NativeSelectOption>
            <NativeSelectOption value='UNIT'>Unidad</NativeSelectOption>
            <NativeSelectOption value='KG'>Kilogramo (kg)</NativeSelectOption>
            <NativeSelectOption value='LB'>Libra (lb)</NativeSelectOption>
          </NativeSelect>
        )}
        <div className='grid grid-cols-2 gap-4'>
          {field('cost', 'Costo de adquisición (COP)', numberInput('cost', '1'))}
          {field('price', 'Precio de venta (COP)', numberInput('price', '1'))}
          {field('initialStock', 'Stock inicial', numberInput('initialStock', '0.001'))}
          {field('minStock', 'Stock mínimo', numberInput('minStock', '0.001'))}
        </div>
      </FieldGroup>
      <Button type='submit' disabled={saving}>
        Guardar producto
      </Button>
    </form>
  );
}
