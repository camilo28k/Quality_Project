import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { trim, trimLower } from '../common/dto-helpers';
import { isValidNit } from './nit';

@ValidatorConstraint({ name: 'nit' })
class NitConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value === 'string' && isValidNit(value);
  }
  defaultMessage(): string {
    return 'El NIT debe tener el formato 900123456-8 y un dígito de verificación válido';
  }
}

/** Campos editables del perfil de la empresa (todos opcionales en la edición). */
export class UpdateCompanyProfileDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'El nombre comercial es obligatorio' })
  @MaxLength(120, {
    message: 'El nombre comercial admite máximo 120 caracteres',
  })
  tradeName?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(160, { message: 'La razón social admite máximo 160 caracteres' })
  legalName?: string;

  @IsOptional()
  @Transform(trim)
  @Validate(NitConstraint)
  taxId?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500, { message: 'La descripción admite máximo 500 caracteres' })
  description?: string;

  @IsOptional()
  @Transform(trim)
  @IsUrl(
    { protocols: ['https'], require_protocol: true },
    { message: 'El logo debe ser una URL https' },
  )
  logoUrl?: string;

  @IsOptional()
  @Transform(trimLower)
  @IsEmail(
    {},
    { message: 'El correo de la empresa no tiene un formato válido' },
  )
  email?: string;

  @IsOptional()
  @Transform(trim)
  @Matches(/^[+\d][\d\s-]{6,19}$/, {
    message: 'El teléfono no tiene un formato válido',
  })
  phone?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(160, { message: 'La dirección admite máximo 160 caracteres' })
  address?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80, { message: 'La ciudad admite máximo 80 caracteres' })
  city?: string;

  @IsOptional()
  @Transform(trim)
  @Matches(/^[A-Z0-9]{1,8}-?$/, {
    message:
      'El prefijo admite de 1 a 8 letras mayúsculas o números (p. ej. TND-)',
  })
  invoicePrefix?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300, { message: 'La nota al pie admite máximo 300 caracteres' })
  invoiceFooter?: string;
}

/** SWR-ONB-001: el asistente exige los campos marcados como obligatorios. */
export class CompleteOnboardingDto extends UpdateCompanyProfileDto {
  @Transform(trim)
  @IsString({ message: 'El nombre comercial es obligatorio' })
  @IsNotEmpty({ message: 'El nombre comercial es obligatorio' })
  @MaxLength(120)
  declare tradeName: string;

  @Transform(trim)
  @Validate(NitConstraint)
  declare taxId: string;

  @Transform(trimLower)
  @IsEmail(
    {},
    { message: 'El correo de la empresa es obligatorio y debe ser válido' },
  )
  declare email: string;

  @Transform(trim)
  @Matches(/^[A-Z0-9]{1,8}-?$/, {
    message:
      'El prefijo admite de 1 a 8 letras mayúsculas o números (p. ej. TND-)',
  })
  declare invoicePrefix: string;

  /** Consecutivo inicial (p. ej. si la empresa ya facturaba en papel). */
  @IsInt({ message: 'El consecutivo inicial debe ser un número entero' })
  @Min(1, { message: 'El consecutivo inicial debe ser al menos 1' })
  @Max(999_999_999)
  firstInvoiceNumber!: number;
}

export class VerifyEmailDto {
  @Transform(trim)
  @Matches(/^\d{6}$/, { message: 'El código tiene 6 dígitos' })
  code!: string;
}
