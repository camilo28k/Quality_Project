import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { trim, trimLower } from '../common/dto-helpers';
import { PaymentMethod } from '@prisma/client';

export class SaleItemDto {
  @IsUUID('4', { message: 'Cada línea debe indicar un producto válido' })
  productId!: string;

  @IsNumber({}, { message: 'La cantidad debe ser un número' })
  quantity!: number;
}

export class CreateSaleDto {
  /** SWR-SALE-010: el cliente genera una clave por cada intento de confirmación. */
  @IsUUID('4', { message: 'Falta la clave de idempotencia de la venta' })
  idempotencyKey!: string;

  /** SWR-PAY-001 (efectivo); la interfaz ofrece también tarjeta y transferencia (D-14). */
  @IsEnum(PaymentMethod, {
    message: 'El medio de pago debe ser CASH, CARD o TRANSFER',
  })
  paymentMethod!: PaymentMethod;

  @IsArray()
  @ArrayMinSize(1, { message: 'La venta debe tener al menos un producto' })
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => SaleItemDto)
  items!: SaleItemDto[];

  /** Opcional (decisión c): si se indica, se le envía la factura (parte 5). */
  @IsOptional()
  @Transform(trimLower)
  @IsEmail({}, { message: 'El correo del cliente no tiene un formato válido' })
  customerEmail?: string;
}

/** Motivo obligatorio para anular o pedir una corrección. */
export class ReasonDto {
  @Transform(trim)
  @IsString({ message: 'El motivo es obligatorio' })
  @IsNotEmpty({ message: 'El motivo es obligatorio' })
  @MaxLength(300, { message: 'El motivo admite máximo 300 caracteres' })
  reason!: string;
}

/** SWR-SALE-V02: la reemisión es una venta nueva completa más el motivo de la corrección. */
export class ReissueSaleDto extends CreateSaleDto {
  @Transform(trim)
  @IsString({ message: 'El motivo es obligatorio' })
  @IsNotEmpty({ message: 'El motivo es obligatorio' })
  @MaxLength(300, { message: 'El motivo admite máximo 300 caracteres' })
  reason!: string;
}

export class ResolveCorrectionDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300, { message: 'La respuesta admite máximo 300 caracteres' })
  resolution?: string;
}

export class SendInvoiceDto {
  /** Opcional: si no se indica, se usa el correo del cliente guardado en la venta. */
  @IsOptional()
  @Transform(trimLower)
  @IsEmail({}, { message: 'El correo no tiene un formato válido' })
  to?: string;
}
