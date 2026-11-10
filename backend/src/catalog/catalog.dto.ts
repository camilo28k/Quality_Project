import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { Unit } from '@prisma/client';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** SWR-CAT-001 */
export class CreateCategoryDto {
  @Transform(trim)
  @IsString({ message: 'El nombre es obligatorio' })
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  @MaxLength(60, { message: 'El nombre admite máximo 60 caracteres' })
  name!: string;
}

/** SWR-PROD-001: todos los campos son obligatorios. */
export class CreateProductDto {
  @Transform(trim)
  @IsString({ message: 'El nombre es obligatorio' })
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  @MaxLength(120, { message: 'El nombre admite máximo 120 caracteres' })
  name!: string;

  @IsUUID('4', { message: 'La categoría es obligatoria' })
  categoryId!: string;

  @IsEnum(Unit, { message: 'La unidad debe ser UNIT, KG o LB' })
  unit!: Unit;

  @IsInt({ message: 'El costo debe ser un valor entero en pesos' })
  @Min(0, { message: 'El costo no puede ser negativo' })
  cost!: number;

  @IsInt({ message: 'El precio debe ser un valor entero en pesos' })
  @Min(0, { message: 'El precio no puede ser negativo' })
  price!: number;

  @IsNumber(
    { maxDecimalPlaces: 3 },
    { message: 'El stock inicial admite máximo 3 decimales' },
  )
  @Min(0, { message: 'El stock inicial no puede ser negativo' })
  initialStock!: number;

  @IsNumber(
    { maxDecimalPlaces: 3 },
    { message: 'El stock mínimo admite máximo 3 decimales' },
  )
  @Min(0, { message: 'El stock mínimo no puede ser negativo' })
  minStock!: number;
}

/**
 * Edición de soporte (SWR-PROD-004 no seleccionado): permite cambiar precio
 * para verificar SWR-SALE-005 (TC-DATA-001).
 */
export class UpdateProductDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'El nombre no puede estar vacío' })
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsInt({ message: 'El costo debe ser un valor entero en pesos' })
  @Min(0, { message: 'El costo no puede ser negativo' })
  cost?: number;

  @IsOptional()
  @IsInt({ message: 'El precio debe ser un valor entero en pesos' })
  @Min(0, { message: 'El precio no puede ser negativo' })
  price?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0, { message: 'El stock mínimo no puede ser negativo' })
  minStock?: number;
}
