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

/** SWR-ROLE-002: el ADMIN crea vendedores de su empresa con contraseña temporal. */
export class CreateSellerDto {
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

export class UpdateSellerDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'El nombre no puede estar vacío' })
  @MaxLength(80, { message: 'El nombre admite máximo 80 caracteres' })
  name?: string;

  @IsOptional()
  @Transform(trimLower)
  @IsEmail({}, { message: 'El correo no tiene un formato válido' })
  email?: string;
}
