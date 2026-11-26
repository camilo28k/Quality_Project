import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import {
  PASSWORD_MESSAGE,
  PASSWORD_RULE,
  trim,
  trimLower,
} from '../common/dto-helpers';

/** El SUPER_ADMIN crea la empresa solo con un nombre provisional (el resto lo completa el ADMIN). */
export class CreateCompanyDto {
  @Transform(trim)
  @IsString({ message: 'El nombre de la empresa es obligatorio' })
  @IsNotEmpty({ message: 'El nombre de la empresa es obligatorio' })
  @MaxLength(120, { message: 'El nombre admite máximo 120 caracteres' })
  tradeName!: string;
}

export class UpdateCompanyDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'El nombre de la empresa no puede estar vacío' })
  @MaxLength(120, { message: 'El nombre admite máximo 120 caracteres' })
  tradeName?: string;

  @IsOptional()
  @Transform(trimLower)
  @IsEmail(
    {},
    { message: 'El correo de la empresa no tiene un formato válido' },
  )
  email?: string;
}

/** ADMIN de la empresa con contraseña temporal: deberá cambiarla al iniciar sesión (SWR-ONB-001). */
export class CreateCompanyAdminDto {
  @Transform(trim)
  @IsString({ message: 'El nombre es obligatorio' })
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  @MaxLength(80, { message: 'El nombre admite máximo 80 caracteres' })
  name!: string;

  @Transform(trimLower)
  @IsEmail({}, { message: 'El correo no tiene un formato válido' })
  email!: string;

  @IsString()
  @Matches(PASSWORD_RULE, { message: PASSWORD_MESSAGE })
  temporaryPassword!: string;
}
