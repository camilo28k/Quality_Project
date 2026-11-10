import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsNumber,
  IsUUID,
  ValidateNested,
} from 'class-validator';
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
}
