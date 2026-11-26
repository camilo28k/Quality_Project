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

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500, { message: 'La descripción admite máximo 500 caracteres' })
  description?: string;

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
 * Edición de productos. El vendedor solo puede cambiar nombre y descripción;
 * el precio lo propone con una solicitud (decisión a, SWR-ROLE-003).
 */
export class UpdateProductDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'El nombre no puede estar vacío' })
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500, { message: 'La descripción admite máximo 500 caracteres' })
  description?: string;

  @IsOptional()
  @IsUUID('4', { message: 'La categoría no es válida' })
  categoryId?: string;

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

/** Campos que el vendedor puede editar por sí mismo. */
export const SELLER_EDITABLE: ReadonlyArray<keyof UpdateProductDto> = [
  'name',
  'description',
];

export class UpdateCategoryDto extends CreateCategoryDto {}

/** SWR-STK-001: entrada o baja de stock con motivo obligatorio. */
export class StockMovementDto {
  @IsNumber(
    { maxDecimalPlaces: 3 },
    { message: 'La cantidad admite máximo 3 decimales' },
  )
  @Min(0.001, { message: 'La cantidad debe ser mayor que cero' })
  quantity!: number;

  @Transform(trim)
  @IsString({ message: 'El motivo es obligatorio' })
  @IsNotEmpty({ message: 'El motivo es obligatorio' })
  @MaxLength(200, { message: 'El motivo admite máximo 200 caracteres' })
  reason!: string;
}

/** El vendedor propone un precio; el ADMIN decide. */
export class PriceRequestDto {
  @IsInt({ message: 'El precio debe ser un valor entero en pesos' })
  @Min(0, { message: 'El precio no puede ser negativo' })
  proposedPrice!: number;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200, { message: 'El motivo admite máximo 200 caracteres' })
  reason?: string;
}

/** Aprobación de un producto creado por un vendedor; el ADMIN puede fijar el precio final. */
export class ApproveProductDto {
  @IsOptional()
  @IsInt({ message: 'El precio debe ser un valor entero en pesos' })
  @Min(0, { message: 'El precio no puede ser negativo' })
  price?: number;
}

export class ResolveRequestDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200, { message: 'El motivo admite máximo 200 caracteres' })
  reason?: string;
}
