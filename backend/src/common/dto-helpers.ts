import type { TransformFnParams } from 'class-transformer';

export const trim = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() : value;

export const trimLower = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

/** Política mínima de contraseña para cuentas creadas en la aplicación. */
export const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d).{10,72}$/;
export const PASSWORD_MESSAGE =
  'La contraseña debe tener entre 10 y 72 caracteres, con letras y números';
