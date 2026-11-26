import { isValidNit } from '@/lib/nit';
import { z } from 'zod';

const optionalText = (max: number, label: string) =>
  z.string().trim().max(max, `${label} admite máximo ${max} caracteres`).optional().or(z.literal(''));

/** Mismas reglas que el backend (SWR-ONB-001/002); el backend vuelve a validar. */
export const companyFields = {
  tradeName: z.string().trim().min(1, 'El nombre comercial es obligatorio').max(120, 'Máximo 120 caracteres'),
  legalName: optionalText(160, 'La razón social'),
  taxId: z
    .string()
    .trim()
    .refine(isValidNit, 'El NIT debe tener el formato 900123456-8 y un dígito de verificación válido'),
  description: optionalText(500, 'La descripción'),
  logoUrl: z
    .string()
    .trim()
    .refine((v) => v === '' || /^https:\/\/\S+$/.test(v), 'El logo debe ser una URL https')
    .optional(),
  email: z.string().trim().toLowerCase().email('El correo de la empresa debe ser válido'),
  phone: z
    .string()
    .trim()
    .refine((v) => v === '' || /^[+\d][\d\s-]{6,19}$/.test(v), 'El teléfono no tiene un formato válido')
    .optional(),
  address: optionalText(160, 'La dirección'),
  city: optionalText(80, 'La ciudad'),
  invoicePrefix: z
    .string()
    .trim()
    .regex(/^[A-Z0-9]{1,8}-?$/, 'De 1 a 8 letras mayúsculas o números (p. ej. TND-)'),
  invoiceFooter: optionalText(300, 'La nota al pie'),
  firstInvoiceNumber: z.coerce
    .number({ message: 'El consecutivo inicial debe ser un número' })
    .int('El consecutivo inicial debe ser un número entero')
    .min(1, 'El consecutivo inicial debe ser al menos 1')
};

export type CompanyFieldKey = keyof typeof companyFields;

/** Quita los campos vacíos opcionales para no enviar cadenas vacías al backend. */
export function compact<T extends Record<string, unknown>>(data: T): Partial<T> {
  return Object.fromEntries(Object.entries(data).filter(([, v]) => v !== '' && v !== undefined)) as Partial<T>;
}

export interface CompanyProfile {
  id: string;
  tradeName: string;
  legalName: string | null;
  taxId: string | null;
  description: string | null;
  logoUrl: string | null;
  email: string | null;
  emailVerifiedAt: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  invoicePrefix: string;
  nextInvoiceNumber: number;
  invoiceFooter: string | null;
  currency: string;
  timezone: string;
  onboardingCompleted: boolean;
}
