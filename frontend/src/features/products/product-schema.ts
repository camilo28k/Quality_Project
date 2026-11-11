import { z } from 'zod';

const decimals = (max: number) => (v: number) => Math.abs(v * 10 ** max - Math.round(v * 10 ** max)) < 1e-6;

const requiredNumber = (label: string) =>
  z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : Number(v)),
    z.number({ error: `${label} es obligatorio` }).refine(Number.isFinite, `${label} debe ser un número`)
  );

/** SWR-PROD-001: todos los campos obligatorios; montos en COP enteros (D-04). */
export const productSchema = z
  .object({
    name: z.string().trim().min(1, 'El nombre es obligatorio').max(120),
    categoryId: z.string().min(1, 'La categoría es obligatoria'),
    unit: z.enum(['UNIT', 'KG', 'LB'], { error: 'La unidad es obligatoria' }),
    cost: requiredNumber('El costo')
      .pipe(z.number().int('El costo debe ser un valor entero en pesos').min(0, 'El costo no puede ser negativo')),
    price: requiredNumber('El precio')
      .pipe(z.number().int('El precio debe ser un valor entero en pesos').min(0, 'El precio no puede ser negativo')),
    initialStock: requiredNumber('El stock inicial')
      .pipe(z.number().min(0, 'El stock inicial no puede ser negativo').refine(decimals(3), 'Máximo 3 decimales')),
    minStock: requiredNumber('El stock mínimo')
      .pipe(z.number().min(0, 'El stock mínimo no puede ser negativo').refine(decimals(3), 'Máximo 3 decimales'))
  })
  .refine((p) => p.unit !== 'UNIT' || Number.isInteger(p.initialStock), {
    path: ['initialStock'],
    message: 'Los productos por unidad solo admiten cantidades enteras'
  });

export type ProductInput = z.infer<typeof productSchema>;
export type ProductField = keyof ProductInput;
