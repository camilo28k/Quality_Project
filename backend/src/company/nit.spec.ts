import { isValidNit, nitCheckDigit } from './nit';

/** SWR-ONB-002: dígito de verificación del NIT (DIAN, módulo 11). */
describe('NIT', () => {
  it.each([
    ['900123456', 8],
    ['800197268', 4], // NIT público de la DIAN
    ['860034313', 7],
    ['12345', 8],
  ])('DV de %s es %i', (n, dv) => {
    expect(nitCheckDigit(n)).toBe(dv);
  });

  it('acepta el formato número-DV con DV correcto', () => {
    expect(isValidNit('800197268-4')).toBe(true);
    expect(isValidNit(' 900123456-8 ')).toBe(true);
  });

  it('rechaza DV incorrecto, sin DV, con letras, con puntos o fuera de longitud', () => {
    for (const v of [
      '800197268-5',
      '800197268',
      '80019726A-4',
      '800.197.268-4',
      '1234-1',
      '1234567890123456-0',
    ]) {
      expect(isValidNit(v)).toBe(false);
    }
  });
});
