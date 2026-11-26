/** Dígito de verificación del NIT (DIAN, módulo 11); igual que en el backend (SWR-ONB-002). */
const WEIGHTS = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];

export function nitCheckDigit(number: string): number {
  const sum = number
    .split('')
    .reverse()
    .reduce((acc, d, i) => acc + Number(d) * WEIGHTS[i], 0);
  const r = sum % 11;
  return r > 1 ? 11 - r : r;
}

export function isValidNit(value: string): boolean {
  const m = /^(\d{5,15})-(\d)$/.exec(value.trim());
  return !!m && nitCheckDigit(m[1]) === Number(m[2]);
}
