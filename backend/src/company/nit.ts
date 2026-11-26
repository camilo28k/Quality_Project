/**
 * SWR-ONB-002: dígito de verificación del NIT colombiano (DIAN, módulo 11).
 * Pesos aplicados de derecha a izquierda sobre el número sin el DV.
 */
const WEIGHTS = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];

export function nitCheckDigit(number: string): number {
  const digits = number.split('').reverse();
  const sum = digits.reduce((acc, d, i) => acc + Number(d) * WEIGHTS[i], 0);
  const r = sum % 11;
  return r > 1 ? 11 - r : r;
}

/** Formato «900123456-8» (5 a 15 dígitos, guion y DV); valida el DV. */
export function isValidNit(value: string): boolean {
  const m = /^(\d{5,15})-(\d)$/.exec(value.trim());
  if (!m) return false;
  return nitCheckDigit(m[1]) === Number(m[2]);
}
